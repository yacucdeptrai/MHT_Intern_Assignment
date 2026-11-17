import {
  auditLogRepository,
  compactBatch,
  conflictGuardStmt,
  isVersionConflict,
  taskRepository,
  taskStatusRepository,
  type AppBatchItem,
  type TaskStatus,
} from "@pm/db";
import {
  canManageStatuses,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  StatusCreateSchema,
  StatusIdSchema,
  StatusReorderSchema,
  StatusUpdateSchema,
  toActor,
  ValidationError,
  type StatusCategory,
  type StatusCreateInput,
  type StatusIdInput,
  type StatusReorderInput,
  type StatusUpdateInput,
} from "@pm/domain";

import type { RequestContext } from "../utils/requestContext.server";

function extractFieldErrors(error: {
  issues: readonly { path: readonly unknown[]; message: string }[];
}): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string") {
      fieldErrors[field] = fieldErrors[field] ?? [];
      fieldErrors[field].push(issue.message);
    }
  }
  return fieldErrors;
}

const DEFAULT_STATUS_SEEDS: Array<{
  name: string;
  category: StatusCategory;
  position: number;
}> = [
  { name: "To Do", category: "TODO", position: 1 },
  { name: "In Progress", category: "IN_PROGRESS", position: 2 },
  { name: "Review", category: "REVIEW", position: 3 },
  { name: "Done", category: "DONE", position: 4 },
];

function requireStatusAdmin(ctx: RequestContext) {
  if (!ctx.user) {
    throw new ForbiddenError("Authentication required");
  }
  const actor = toActor(ctx.user);
  if (!canManageStatuses(actor)) {
    throw new ForbiddenError("You do not have permission to manage statuses");
  }
  return ctx.user;
}

export const taskStatusService = {
  async listStatuses(ctx: RequestContext): Promise<TaskStatus[]> {
    return taskStatusRepository.list(ctx.db);
  },

  async getTaskCountsByStatus(ctx: RequestContext): Promise<Record<string, number>> {
    return taskRepository.countGroupedByStatusId(ctx.db);
  },

  async createStatus(ctx: RequestContext, input: StatusCreateInput): Promise<TaskStatus> {
    const currentUser = requireStatusAdmin(ctx);

    const parsed = StatusCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid status data", extractFieldErrors(parsed.error));
    }

    const { name, category } = parsed.data;

    const existing = await taskStatusRepository.findByName(ctx.db, name);
    if (existing) {
      throw new ValidationError("Status name already exists", { name: ["Status name already exists"] });
    }

    const allStatuses = await taskStatusRepository.list(ctx.db);
    const maxPosition = allStatuses.reduce((max, s) => Math.max(max, s.position), 0);
    const position = maxPosition + 1;

    const id = crypto.randomUUID();
    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    const newStatus = {
      id,
      name,
      category,
      position,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await ctx.db.batch([
        taskStatusRepository.insertStmt(ctx.db, newStatus),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "STATUS_CREATED",
          entityType: "STATUS",
          entityId: id,
          projectId: null,
          changes: {
            name: { from: null, to: name },
            category: { from: null, to: category },
          },
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Status was modified concurrently");
      }
      throw error;
    }

    ctx.logger.info("Task status created", { statusId: id, name, category, userId: currentUser.id });
    return newStatus;
  },

  async updateStatus(ctx: RequestContext, input: StatusUpdateInput): Promise<TaskStatus> {
    const currentUser = requireStatusAdmin(ctx);

    const parsed = StatusUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid status data", extractFieldErrors(parsed.error));
    }

    const { statusId, name, category } = parsed.data;

    const current = await taskStatusRepository.findById(ctx.db, statusId);
    if (!current) {
      throw new NotFoundError("Status not found");
    }

    if (name && name.toLowerCase() !== current.name.toLowerCase()) {
      const existingName = await taskStatusRepository.findByName(ctx.db, name);
      if (existingName && existingName.id !== statusId) {
        throw new ValidationError("Status name already exists", { name: ["Status name already exists"] });
      }
    }

    if (category && category !== current.category) {
      // FR-20 c4: Changing category is rejected if any task uses the status. Otherwise allowed.
      const taskCount = await taskRepository.countByStatusId(ctx.db, current.id);
      if (taskCount > 0) {
        throw new ValidationError("Cannot change status category when tasks use this status");
      }
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();
    const patch: Partial<Omit<TaskStatus, "id">> = { updatedAt: now };

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (name && name !== current.name) {
      patch.name = name;
      changes.name = { from: current.name, to: name };
    }
    if (category && category !== current.category) {
      patch.category = category;
      changes.category = { from: current.category, to: category };
    }

    if (Object.keys(changes).length === 0) {
      return current;
    }

    try {
      await ctx.db.batch([
        taskStatusRepository.updateStmt(ctx.db, statusId, patch),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "STATUS_UPDATED",
          entityType: "STATUS",
          entityId: statusId,
          projectId: null,
          changes,
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Status was modified concurrently");
      }
      throw error;
    }

    ctx.logger.info("Task status updated", { statusId, userId: currentUser.id });
    return { ...current, ...patch };
  },

  async reorderStatuses(ctx: RequestContext, input: StatusReorderInput): Promise<void> {
    const currentUser = requireStatusAdmin(ctx);

    const parsed = StatusReorderSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid reorder data", extractFieldErrors(parsed.error));
    }

    const { orderedIds } = parsed.data;
    const now = ctx.clock.now();

    const stmts: AppBatchItem[] = orderedIds.map((id, index) =>
      taskStatusRepository.updatePositionStmt(ctx.db, id, index + 1, now),
    );

    try {
      await ctx.db.batch(compactBatch(stmts));
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Statuses were modified concurrently");
      }
      throw error;
    }

    ctx.logger.info("Task statuses reordered", { count: orderedIds.length, userId: currentUser.id });
  },

  async setDefault(ctx: RequestContext, input: StatusIdInput): Promise<TaskStatus> {
    const currentUser = requireStatusAdmin(ctx);

    const parsed = StatusIdSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid status ID", extractFieldErrors(parsed.error));
    }

    const { statusId } = parsed.data;
    const target = await taskStatusRepository.findById(ctx.db, statusId);
    if (!target) {
      throw new NotFoundError("Status not found");
    }

    if (target.isDefault) {
      return target;
    }

    const currentDefault = await taskStatusRepository.findDefaultByCategory(ctx.db, target.category);
    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    // A25: update old default is_default = 0; guard; update new default is_default = 1; guard; insert audit STATUS_UPDATED
    const batchItems: (AppBatchItem | null)[] = [];
    if (currentDefault) {
      batchItems.push(taskStatusRepository.clearDefaultStmt(ctx.db, currentDefault.id, now), conflictGuardStmt(ctx.db));
    }
    batchItems.push(
      taskStatusRepository.setDefaultStmt(ctx.db, target.id, now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: currentUser.id,
        action: "STATUS_UPDATED",
        entityType: "STATUS",
        entityId: target.id,
        projectId: null,
        changes: {
          isDefault: { from: false, to: true },
        },
        createdAt: now,
      }),
    );

    try {
      await ctx.db.batch(compactBatch(batchItems));
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Status was modified concurrently");
      }
      throw error;
    }

    ctx.logger.info("Category default status updated", {
      statusId: target.id,
      category: target.category,
      userId: currentUser.id,
    });
    return { ...target, isDefault: true, updatedAt: now };
  },

  async deleteStatus(ctx: RequestContext, input: StatusIdInput): Promise<void> {
    const currentUser = requireStatusAdmin(ctx);

    const parsed = StatusIdSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid status ID", extractFieldErrors(parsed.error));
    }

    const { statusId } = parsed.data;
    const target = await taskStatusRepository.findById(ctx.db, statusId);
    if (!target) {
      throw new NotFoundError("Status not found");
    }

    if (target.isDefault) {
      throw new ValidationError("Cannot delete category default status");
    }

    // FR-20 c3: "Given a status used by any task, including archived tasks, When the Admin deletes it, Then the request is rejected with 400 'This status is in use by N tasks'."
    const taskCount = await taskRepository.countByStatusId(ctx.db, target.id);
    if (taskCount > 0) {
      throw new ValidationError(`This status is in use by ${taskCount} tasks`);
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    // A26: delete from task_statuses where id and not default; guard; insert audit STATUS_DELETED
    try {
      await ctx.db.batch([
        taskStatusRepository.deleteStmt(ctx.db, target.id),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "STATUS_DELETED",
          entityType: "STATUS",
          entityId: target.id,
          projectId: null,
          changes: {
            name: { from: target.name, to: null },
            category: { from: target.category, to: null },
          },
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Status was modified concurrently");
      }
      throw error;
    }

    ctx.logger.info("Task status deleted", { statusId: target.id, userId: currentUser.id });
  },

  async seedDefaultStatuses(ctx: RequestContext): Promise<void> {
    const existing = await taskStatusRepository.list(ctx.db);
    const now = ctx.clock.now();

    for (const seed of DEFAULT_STATUS_SEEDS) {
      const hasDefault = existing.some((s) => s.category === seed.category && s.isDefault);
      if (!hasDefault) {
        const id = crypto.randomUUID();
        await taskStatusRepository.insert(ctx.db, {
          id,
          name: seed.name,
          category: seed.category,
          position: seed.position,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
};
