import {
  auditLogRepository,
  compactBatch,
  notificationRepository,
  outboxJobRepository,
  projectMemberRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  type AppBatchItem,
  type TaskRow,
} from "@pm/db";
import {
  canAssignTask,
  canCreateTask,
  ForbiddenError,
  TaskCreateSchema,
  toActor,
  UnauthorizedError,
  ValidationError,
  type TaskCreateInput,
} from "@pm/domain";

import { loadProjectAccess } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface TaskDto extends TaskRow {
  assignees: string[];
}

export const taskService = {
  async createTask(ctx: RequestContext, projectId: string, rawInput: unknown): Promise<TaskDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }
    const currentUser = ctx.user;

    const parsed = TaskCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid task data", fieldErrors);
    }

    const data: TaskCreateInput = parsed.data;

    // Load project access (throws NotFoundError 404 for non-members)
    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(ctx.user, access);
    if (!canCreateTask(actor)) {
      throw new ForbiddenError("You do not have permission to create tasks in this project");
    }

    // Validate assignees if provided
    const assigneeIds = data.assigneeIds;
    if (assigneeIds.length > 0) {
      if (!canAssignTask(actor)) {
        throw new ForbiddenError("Only project leads and admins can assign tasks");
      }

      for (const assigneeId of assigneeIds) {
        const member = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, assigneeId);
        if (!member) {
          throw new ValidationError("Assignees must be project members", {
            assigneeIds: ["Assignees must be project members"],
          });
        }
      }
    }

    // Validate sprint if provided
    if (data.sprintId) {
      const sprint = await sprintRepository.findById(ctx.db, data.sprintId);
      if (!sprint || sprint.projectId !== projectId) {
        throw new ValidationError("Sprint does not belong to this project", {
          sprintId: ["Sprint does not belong to this project"],
        });
      }
    }

    // Validate parent task if provided
    if (data.parentTaskId) {
      const parent = await taskRepository.findById(ctx.db, data.parentTaskId);
      if (!parent || parent.projectId !== projectId) {
        throw new ValidationError("Parent task not found in this project", {
          parentTaskId: ["Parent task not found in this project"],
        });
      }
      if (parent.parentTaskId) {
        throw new ValidationError("Sub-tasks can only be one level deep", {
          parentTaskId: ["Sub-tasks can only be one level deep"],
        });
      }
    }

    // Determine default status for category TODO
    let defaultStatus = await taskStatusRepository.findDefaultByCategory(ctx.db, "TODO");
    if (!defaultStatus) {
      const statuses = await taskStatusRepository.list(ctx.db);
      defaultStatus = statuses.find((s) => s.category === "TODO") ?? statuses[0] ?? null;
    }
    if (!defaultStatus) {
      throw new Error("No default status found");
    }

    const taskId = crypto.randomUUID();
    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    const batchItems: (AppBatchItem | null)[] = [
      taskRepository.insertStmt(ctx.db, {
        id: taskId,
        projectId,
        parentTaskId: data.parentTaskId,
        sprintId: data.sprintId,
        statusId: defaultStatus.id,
        title: data.title,
        description: data.description,
        priority: data.priority,
        startDate: data.startDate,
        dueDate: data.dueDate,
        createdById: currentUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskId, assigneeIds, now),
      ...assigneeIds.map((assigneeId) =>
        notificationRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          entityId: taskId,
          projectId,
          payload: { title: data.title, actorName: currentUser.fullName },
          readAt: null,
          createdAt: now,
        }),
      ),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: currentUser.id,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        createdAt: now,
      }),
    ];

    if (!data.parentTaskId) {
      batchItems.push(
        outboxJobRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          type: "SLACK_POST_TASK",
          payload: JSON.stringify({
            taskId,
            projectId,
            createdById: currentUser.id,
            title: data.title,
          }),
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }

    // Atomic batch A14
    await ctx.db.batch(compactBatch(batchItems));

    const created = await taskRepository.findById(ctx.db, taskId);
    if (!created) {
      throw new Error("Failed to load created task");
    }

    return {
      ...created,
      assignees: assigneeIds,
    };
  },
};
