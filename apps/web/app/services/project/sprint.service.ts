import {
  auditLogRepository,
  conflictGuardStmt,
  isVersionConflict,
  sprintRepository,
  taskRepository,
  type SprintRow,
} from "@pm/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SprintArchiveSchema,
  SprintCreateSchema,
  SprintUpdateSchema,
  UnauthorizedError,
  ValidationError,
  canManageSprint,
  computeSprintStatus,
  toActor,
  type SprintWithStatsDto,
} from "@pm/domain";

import { loadProjectAccess } from "../../utils/auth.server";
import type { RequestContext } from "../../utils/requestContext.server";

function extractFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string") {
      fieldErrors[field] = fieldErrors[field] ?? [];
      fieldErrors[field].push(issue.message);
    }
  }
  return fieldErrors;
}

export const sprintService = {
  async listSprints(ctx: RequestContext, projectId: string): Promise<SprintWithStatsDto[]> {
    await loadProjectAccess(ctx, projectId);
    const rows = await sprintRepository.listByProjectWithStats(ctx.db, projectId);

    return rows.map((row) => {
      const status = computeSprintStatus({
        startDate: row.startDate,
        endDate: row.endDate,
      });
      const completionRate = row.taskCount === 0 ? null : Math.round((row.completedCount / row.taskCount) * 100);

      return {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        startDate: row.startDate,
        endDate: row.endDate,
        status,
        taskCount: row.taskCount,
        completedCount: row.completedCount,
        completionRate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  },

  async createSprint(ctx: RequestContext, projectId: string, rawInput: unknown): Promise<SprintRow> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageSprint(actor)) {
      throw new ForbiddenError("Only project leads and admins can manage sprints");
    }

    const parsed = SprintCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError("Invalid sprint input", extractFieldErrors(parsed.error.issues));
    }
    const data = parsed.data;

    const sprintId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const now = ctx.clock.now();

    await ctx.db.batch([
      sprintRepository.insertStmt(ctx.db, {
        id: sprintId,
        projectId,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        createdAt: now,
        updatedAt: now,
      }),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: currentUser.id,
        action: "SPRINT_CREATED",
        entityType: "SPRINT",
        entityId: sprintId,
        projectId,
        changes: {
          name: { from: null, to: data.name },
          startDate: { from: null, to: data.startDate },
          endDate: { from: null, to: data.endDate },
        },
        createdAt: now,
      }),
    ]);

    ctx.logger.info("Sprint created", {
      sprintId,
      projectId,
      actorId: currentUser.id,
    });

    const sprint = await sprintRepository.findById(ctx.db, sprintId);
    if (!sprint) {
      throw new Error("Failed to load created sprint");
    }
    return sprint;
  },

  async updateSprint(ctx: RequestContext, projectId: string, rawInput: unknown): Promise<SprintRow> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageSprint(actor)) {
      throw new ForbiddenError("Only project leads and admins can manage sprints");
    }

    const parsed = SprintUpdateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError("Invalid sprint update input", extractFieldErrors(parsed.error.issues));
    }
    const data = parsed.data;

    const existing = await sprintRepository.findById(ctx.db, data.sprintId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError("Sprint not found");
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (data.name !== undefined && data.name !== existing.name) {
      changes.name = { from: existing.name, to: data.name };
    }
    if (data.startDate !== undefined && data.startDate !== existing.startDate) {
      changes.startDate = { from: existing.startDate, to: data.startDate };
    }
    if (data.endDate !== undefined && data.endDate !== existing.endDate) {
      changes.endDate = { from: existing.endDate, to: data.endDate };
    }

    try {
      await ctx.db.batch([
        sprintRepository.updateStmt(ctx.db, {
          id: data.sprintId,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          now,
        }),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "SPRINT_UPDATED",
          entityType: "SPRINT",
          entityId: data.sprintId,
          projectId,
          changes,
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("This sprint was changed by someone else. Reload to see the latest version.");
      }
      throw error;
    }

    ctx.logger.info("Sprint updated", {
      sprintId: data.sprintId,
      projectId,
      actorId: currentUser.id,
    });

    const updated = await sprintRepository.findById(ctx.db, data.sprintId);
    if (!updated) {
      throw new Error("Failed to load updated sprint");
    }
    return updated;
  },

  async archiveSprint(ctx: RequestContext, projectId: string, rawInput: unknown): Promise<SprintRow> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageSprint(actor)) {
      throw new ForbiddenError("Only project leads and admins can manage sprints");
    }

    const parsed = SprintArchiveSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError("Invalid sprint archive input", extractFieldErrors(parsed.error.issues));
    }
    const data = parsed.data;

    const existing = await sprintRepository.findById(ctx.db, data.sprintId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError("Sprint not found");
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    try {
      await ctx.db.batch([
        sprintRepository.archiveStmt(ctx.db, data.sprintId, now),
        conflictGuardStmt(ctx.db),
        taskRepository.clearSprintBySprintIdStmt(ctx.db, {
          sprintId: data.sprintId,
          now,
        }),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "SPRINT_ARCHIVED",
          entityType: "SPRINT",
          entityId: data.sprintId,
          projectId,
          changes: {
            deletedAt: { from: null, to: now.toISOString() },
          },
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("This sprint was changed by someone else. Reload to see the latest version.");
      }
      throw error;
    }

    ctx.logger.info("Sprint archived", {
      sprintId: data.sprintId,
      projectId,
      actorId: currentUser.id,
    });

    const archived = await sprintRepository.findByIdIncludingArchived(ctx.db, data.sprintId);
    if (!archived) {
      throw new Error("Failed to load archived sprint");
    }
    return archived;
  },
};
