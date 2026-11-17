import {
  auditLogRepository,
  compactBatch,
  conflictGuardStmt,
  isVersionConflict,
  notificationRepository,
  outboxJobRepository,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  type AppBatchItem,
  type TaskRow,
} from "@pm/db";
import {
  canApproveTask,
  canArchiveTask,
  canAssignTask,
  canCreateTask,
  canEditTask,
  canReopenTask,
  ConflictError,
  ForbiddenError,
  getTodayDateString,
  isDueSoon,
  isOverdue,
  isTodayPriority,
  MyTaskFiltersSchema,
  NotFoundError,
  ProjectTaskFiltersSchema,
  TaskArchiveSchema,
  TaskAssignSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  toActor,
  UnauthorizedError,
  ValidationError,
  type MemberOption,
  type MyTasksLoaderData,
  type Page,
  type ProjectOption,
  type ProjectTaskFilters,
  type SprintOption,
  type StatusOption,
  type TaskArchiveInput,
  type TaskAssigneeInfo,
  type TaskAssignInput,
  type TaskCreateInput,
  type TaskDetailDto,
  type TaskDetailLoaderData,
  type TaskListItem,
  type TaskPermissions,
  type TaskPolicyTarget,
  type TaskUpdateInput,
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

    // Validate parent task or sprint
    let targetSprintId = data.sprintId;
    if (data.parentTaskId) {
      const parent = await taskRepository.findById(ctx.db, data.parentTaskId);
      if (!parent || parent.projectId !== projectId) {
        throw new ValidationError("Parent task not found in this project", {
          parentTaskId: ["Parent task not found in this project"],
        });
      }
      if (parent.parentTaskId) {
        throw new ValidationError("Sub-tasks cannot have sub-tasks", {
          parentTaskId: ["Sub-tasks cannot have sub-tasks"],
        });
      }
      // FR-17 c1: Sub-tasks inherit parent's sprint; any user-supplied sprintId is ignored
      targetSprintId = parent.sprintId ?? undefined;
    } else if (data.sprintId) {
      const sprint = await sprintRepository.findById(ctx.db, data.sprintId);
      if (!sprint || sprint.projectId !== projectId) {
        throw new ValidationError("Sprint does not belong to this project", {
          sprintId: ["Sprint does not belong to this project"],
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
        sprintId: targetSprintId,
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

  async listProjectTasks(
    ctx: RequestContext,
    projectId: string,
    rawFilters: unknown,
  ): Promise<{
    tasks: Page<TaskListItem>;
    filters: ProjectTaskFilters;
    statuses: StatusOption[];
    members: MemberOption[];
    sprints: SprintOption[];
    canCreate: boolean;
    canAssign: boolean;
  }> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const filters = ProjectTaskFiltersSchema.parse(rawFilters ?? {});
    const now = ctx.clock.now();

    const [dbResult, statuses, members, sprints] = await Promise.all([
      taskRepository.listProjectTasks(ctx.db, {
        projectId,
        statusId: filters.statusId,
        assigneeId: filters.assigneeId,
        priority: filters.priority,
        sprintId: filters.sprintId,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
      taskStatusRepository.list(ctx.db),
      projectMemberRepository.listByProjectWithUser(ctx.db, projectId),
      sprintRepository.listByProject(ctx.db, projectId),
    ]);

    const taskIds = dbResult.items.map((t) => t.id);
    const assignees = await taskAssigneeRepository.findByTaskIdsWithUser(ctx.db, taskIds);
    const assigneesByTaskId = new Map<string, TaskAssigneeInfo[]>();
    for (const a of assignees) {
      const list = assigneesByTaskId.get(a.taskId) ?? [];
      list.push({ id: a.userId, fullName: a.fullName, avatarKey: a.avatarKey });
      assigneesByTaskId.set(a.taskId, list);
    }

    const items: TaskListItem[] = dbResult.items.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      number: task.number,
      title: task.title,
      priority: task.priority,
      statusId: task.statusId,
      statusName: task.statusName,
      statusCategory: task.statusCategory,
      dueDate: task.dueDate,
      startDate: task.startDate,
      assignees: assigneesByTaskId.get(task.id) ?? [],
      parentTaskId: task.parentTaskId,
      sprintId: task.sprintId,
      sprintName: task.sprintName,
      isOverdue: isOverdue(
        { dueDate: task.dueDate, statusCategory: task.statusCategory, deletedAt: task.deletedAt },
        now,
      ),
      isDueSoon: isDueSoon(
        { dueDate: task.dueDate, statusCategory: task.statusCategory, deletedAt: task.deletedAt },
        now,
      ),
      isTodayPriority: isTodayPriority(
        {
          dueDate: task.dueDate,
          statusCategory: task.statusCategory,
          deletedAt: task.deletedAt,
          priority: task.priority,
        },
        now,
      ),
      createdAt: typeof task.createdAt === "number" ? task.createdAt : task.createdAt.getTime(),
      updatedAt: typeof task.updatedAt === "number" ? task.updatedAt : task.updatedAt.getTime(),
    }));

    const actor = toActor(ctx.user, access);

    return {
      tasks: {
        items,
        total: dbResult.total,
        page: dbResult.page,
        pageSize: dbResult.pageSize,
        totalPages: dbResult.totalPages,
      },
      filters,
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        isDefault: s.isDefault,
      })),
      members: members.map((m) => ({
        id: m.userId,
        fullName: m.fullName,
        email: m.email,
      })),
      sprints: sprints.map((s) => ({
        id: s.id,
        name: s.name,
      })),
      canCreate: canCreateTask(actor),
      canAssign: canAssignTask(actor),
    };
  },

  async listMyTasks(ctx: RequestContext, rawFilters: unknown): Promise<MyTasksLoaderData> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const filters = MyTaskFiltersSchema.parse(rawFilters ?? {});
    const now = ctx.clock.now();
    const isAdmin = ctx.user.systemRole === "ADMIN";

    let allowedProjectIds: string[] | undefined;
    let accessibleProjects: ProjectOption[];

    if (isAdmin) {
      const allProjects = await projectRepository.listAll(ctx.db);
      accessibleProjects = allProjects.map((p) => ({ id: p.id, code: p.code, name: p.name }));
    } else {
      const memberships = await projectMemberRepository.listByUser(ctx.db, ctx.user.id);
      const userProjects = await projectRepository.listForUser(ctx.db, ctx.user.id);
      allowedProjectIds = memberships.map((m) => m.projectId);
      accessibleProjects = userProjects.map((p) => ({ id: p.id, code: p.code, name: p.name }));
    }

    const todayStr = getTodayDateString(now);
    const endOfWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfWeekStr = getTodayDateString(endOfWeekDate);

    const [dbResult, statuses] = await Promise.all([
      taskRepository.listMyTasks(ctx.db, {
        userId: ctx.user.id,
        allowedProjectIds,
        projectId: filters.projectId,
        statusId: filters.statusId,
        priority: filters.priority,
        dueRange: filters.dueRange,
        todayStr,
        endOfWeekStr,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
      taskStatusRepository.list(ctx.db),
    ]);

    const taskIds = dbResult.items.map((t) => t.id);
    const assignees = await taskAssigneeRepository.findByTaskIdsWithUser(ctx.db, taskIds);
    const assigneesByTaskId = new Map<string, TaskAssigneeInfo[]>();
    for (const a of assignees) {
      const list = assigneesByTaskId.get(a.taskId) ?? [];
      list.push({ id: a.userId, fullName: a.fullName, avatarKey: a.avatarKey });
      assigneesByTaskId.set(a.taskId, list);
    }

    const items: TaskListItem[] = dbResult.items.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      projectCode: task.projectCode,
      projectName: task.projectName,
      number: task.number,
      title: task.title,
      priority: task.priority,
      statusId: task.statusId,
      statusName: task.statusName,
      statusCategory: task.statusCategory,
      dueDate: task.dueDate,
      startDate: task.startDate,
      assignees: assigneesByTaskId.get(task.id) ?? [],
      parentTaskId: task.parentTaskId,
      sprintId: task.sprintId,
      sprintName: task.sprintName,
      isOverdue: isOverdue(
        { dueDate: task.dueDate, statusCategory: task.statusCategory, deletedAt: task.deletedAt },
        now,
      ),
      isDueSoon: isDueSoon(
        { dueDate: task.dueDate, statusCategory: task.statusCategory, deletedAt: task.deletedAt },
        now,
      ),
      isTodayPriority: isTodayPriority(
        {
          dueDate: task.dueDate,
          statusCategory: task.statusCategory,
          deletedAt: task.deletedAt,
          priority: task.priority,
        },
        now,
      ),
      createdAt: typeof task.createdAt === "number" ? task.createdAt : task.createdAt.getTime(),
      updatedAt: typeof task.updatedAt === "number" ? task.updatedAt : task.updatedAt.getTime(),
    }));

    return {
      tasks: {
        items,
        total: dbResult.total,
        page: dbResult.page,
        pageSize: dbResult.pageSize,
        totalPages: dbResult.totalPages,
      },
      filters,
      projects: accessibleProjects,
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        isDefault: s.isDefault,
      })),
    };
  },

  async getTaskDetails(ctx: RequestContext, projectId: string, taskId: string): Promise<TaskDetailLoaderData> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const taskRow = await taskRepository.findDetailsById(ctx.db, taskId);
    if (!taskRow || taskRow.projectId !== projectId || taskRow.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    const now = ctx.clock.now();
    const assignees = await taskAssigneeRepository.findByTaskIdsWithUser(ctx.db, [taskId]);
    const assigneeInfos: TaskAssigneeInfo[] = assignees.map((a) => ({
      id: a.userId,
      fullName: a.fullName,
      avatarKey: a.avatarKey,
    }));

    const subtaskRows = await taskRepository.listSubtasks(ctx.db, taskId);
    const subtaskIds = subtaskRows.map((s) => s.id);
    const subtaskAssignees =
      subtaskIds.length > 0 ? await taskAssigneeRepository.findByTaskIdsWithUser(ctx.db, subtaskIds) : [];
    const subtaskAssigneesByTaskId = new Map<string, TaskAssigneeInfo[]>();
    for (const sa of subtaskAssignees) {
      const list = subtaskAssigneesByTaskId.get(sa.taskId) ?? [];
      list.push({ id: sa.userId, fullName: sa.fullName, avatarKey: sa.avatarKey });
      subtaskAssigneesByTaskId.set(sa.taskId, list);
    }

    const subTasks: TaskListItem[] = subtaskRows.map((st) => ({
      id: st.id,
      projectId: st.projectId,
      number: st.number,
      title: st.title,
      priority: st.priority,
      statusId: st.statusId,
      statusName: st.statusName,
      statusCategory: st.statusCategory,
      dueDate: st.dueDate,
      startDate: st.startDate,
      assignees: subtaskAssigneesByTaskId.get(st.id) ?? [],
      parentTaskId: st.parentTaskId,
      sprintId: st.sprintId,
      sprintName: st.sprintName,
      isOverdue: isOverdue({ dueDate: st.dueDate, statusCategory: st.statusCategory, deletedAt: st.deletedAt }, now),
      isDueSoon: isDueSoon({ dueDate: st.dueDate, statusCategory: st.statusCategory, deletedAt: st.deletedAt }, now),
      isTodayPriority: isTodayPriority(
        {
          dueDate: st.dueDate,
          statusCategory: st.statusCategory,
          deletedAt: st.deletedAt,
          priority: st.priority,
        },
        now,
      ),
      createdAt: typeof st.createdAt === "number" ? st.createdAt : st.createdAt.getTime(),
      updatedAt: typeof st.updatedAt === "number" ? st.updatedAt : st.updatedAt.getTime(),
    }));

    const [statuses, members, sprints] = await Promise.all([
      taskStatusRepository.list(ctx.db),
      projectMemberRepository.listByProjectWithUser(ctx.db, projectId),
      sprintRepository.listByProject(ctx.db, projectId),
    ]);

    const actor = toActor(ctx.user, access);
    const target: TaskPolicyTarget = {
      createdById: taskRow.createdById,
      assigneeIds: assigneeInfos.map((a) => a.id),
      category: taskRow.statusCategory,
    };

    const permissions: TaskPermissions = {
      canEdit: canEditTask(actor, target),
      canArchive: canArchiveTask(actor, target),
      canAssign: canAssignTask(actor),
      canApprove: canApproveTask(actor),
      canReopen: canReopenTask(actor),
    };

    const task: TaskDetailDto = {
      id: taskRow.id,
      projectId: taskRow.projectId,
      projectCode: taskRow.projectCode,
      projectName: taskRow.projectName,
      number: taskRow.number,
      title: taskRow.title,
      description: taskRow.description,
      priority: taskRow.priority,
      statusId: taskRow.statusId,
      statusName: taskRow.statusName,
      statusCategory: taskRow.statusCategory,
      startDate: taskRow.startDate,
      dueDate: taskRow.dueDate,
      sprintId: taskRow.sprintId,
      sprintName: taskRow.sprintName,
      parentTaskId: taskRow.parentTaskId,
      parentTaskTitle: taskRow.parentTaskTitle,
      parentTaskNumber: taskRow.parentTaskNumber,
      createdById: taskRow.createdById,
      creatorName: taskRow.creatorName,
      creatorAvatarKey: taskRow.creatorAvatarKey,
      assignees: assigneeInfos,
      version: taskRow.version,
      statusChangedAt:
        typeof taskRow.statusChangedAt === "number" ? taskRow.statusChangedAt : taskRow.statusChangedAt.getTime(),
      completedAt: taskRow.completedAt
        ? typeof taskRow.completedAt === "number"
          ? taskRow.completedAt
          : taskRow.completedAt.getTime()
        : null,
      createdAt: typeof taskRow.createdAt === "number" ? taskRow.createdAt : taskRow.createdAt.getTime(),
      updatedAt: typeof taskRow.updatedAt === "number" ? taskRow.updatedAt : taskRow.updatedAt.getTime(),
      isOverdue: isOverdue(
        { dueDate: taskRow.dueDate, statusCategory: taskRow.statusCategory, deletedAt: taskRow.deletedAt },
        now,
      ),
      isDueSoon: isDueSoon(
        { dueDate: taskRow.dueDate, statusCategory: taskRow.statusCategory, deletedAt: taskRow.deletedAt },
        now,
      ),
      isTodayPriority: isTodayPriority(
        {
          dueDate: taskRow.dueDate,
          statusCategory: taskRow.statusCategory,
          deletedAt: taskRow.deletedAt,
          priority: taskRow.priority,
        },
        now,
      ),
    };

    return {
      task,
      subTasks,
      members: members.map((m) => ({
        id: m.userId,
        fullName: m.fullName,
        email: m.email,
      })),
      sprints: sprints.map((s) => ({
        id: s.id,
        name: s.name,
      })),
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        isDefault: s.isDefault,
      })),
      permissions,
    };
  },

  async updateTask(ctx: RequestContext, projectId: string, taskId: string, rawInput: unknown): Promise<TaskDetailDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const parsed = TaskUpdateSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid task update data", fieldErrors);
    }

    const data: TaskUpdateInput = parsed.data;

    // Load project access (throws NotFoundError 404 for non-members)
    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const existing = await taskRepository.findDetailsById(ctx.db, taskId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    // FR-13 c4: Tasks in DONE status are frozen
    if (existing.statusCategory === "DONE") {
      throw new ForbiddenError("Reopen the task to edit it");
    }

    // Check editor permission
    const currentAssignees = await taskAssigneeRepository.findByTaskId(ctx.db, taskId);
    const assigneeIds = currentAssignees.map((a) => a.userId);
    const actor = toActor(ctx.user, access);
    if (!canEditTask(actor, { createdById: existing.createdById, assigneeIds, category: existing.statusCategory })) {
      throw new ForbiddenError("You do not have permission to edit this task");
    }

    // Check dates order against existing values
    const startDate = data.startDate !== undefined ? data.startDate : existing.startDate;
    const dueDate = data.dueDate !== undefined ? data.dueDate : existing.dueDate;
    if (startDate && dueDate && dueDate < startDate) {
      throw new ValidationError("Due date must be on or after start date", {
        dueDate: ["Due date must be on or after start date"],
      });
    }

    // Validate sprint if provided (FR-36 c2 & c3)
    let sprintIdToSet = data.sprintId;
    if (existing.parentTaskId) {
      // Sub-tasks follow parent sprint; sprint posted for sub-task is ignored
      sprintIdToSet = undefined;
    } else if (sprintIdToSet) {
      const sprint = await sprintRepository.findById(ctx.db, sprintIdToSet);
      if (!sprint || sprint.projectId !== projectId) {
        throw new ValidationError("Sprint does not belong to this project", {
          sprintId: ["Sprint does not belong to this project"],
        });
      }
    }

    // Compute changes for audit log
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (data.title !== undefined && data.title !== existing.title) {
      changes.title = { from: existing.title, to: data.title };
    }
    if (data.description !== undefined && data.description !== existing.description) {
      changes.description = { from: existing.description, to: data.description };
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      changes.priority = { from: existing.priority, to: data.priority };
    }
    if (data.startDate !== undefined && data.startDate !== existing.startDate) {
      changes.startDate = { from: existing.startDate, to: data.startDate };
    }
    if (data.dueDate !== undefined && data.dueDate !== existing.dueDate) {
      changes.dueDate = { from: existing.dueDate, to: data.dueDate };
    }
    if (sprintIdToSet !== undefined && sprintIdToSet !== existing.sprintId) {
      changes.sprintId = { from: existing.sprintId, to: sprintIdToSet };
    }

    const now = ctx.clock.now();
    const batchItems: (AppBatchItem | null)[] = [
      taskRepository.updateStmt(ctx.db, {
        id: taskId,
        expectedVersion: data.version,
        title: data.title,
        description: data.description,
        priority: data.priority,
        startDate: data.startDate,
        dueDate: data.dueDate,
        sprintId: sprintIdToSet,
        now,
      }),
      conflictGuardStmt(ctx.db),
    ];

    if (!existing.parentTaskId && sprintIdToSet !== undefined && sprintIdToSet !== existing.sprintId) {
      batchItems.push(taskRepository.updateSubtasksSprintStmt(ctx.db, taskId, sprintIdToSet, now));
    }

    batchItems.push(
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: ctx.user.id,
        action: "TASK_UPDATED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes,
        createdAt: now,
      }),
    );

    try {
      await ctx.db.batch(compactBatch(batchItems));
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("This task was changed by someone else. Reload to see the latest version.");
      }
      throw error;
    }

    const detailData = await this.getTaskDetails(ctx, projectId, taskId);
    return detailData.task;
  },

  async assignTask(ctx: RequestContext, projectId: string, taskId: string, rawInput: unknown): Promise<TaskDetailDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }
    const currentUser = ctx.user;

    const parsed = TaskAssignSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid task assignment data", fieldErrors);
    }

    const data: TaskAssignInput = parsed.data;

    // Load project access (throws NotFoundError 404 for non-members)
    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const existing = await taskRepository.findById(ctx.db, taskId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    // Check permission (canAssignTask)
    const actor = toActor(ctx.user, access);
    if (!canAssignTask(actor)) {
      throw new ForbiddenError("Only project leads and admins can assign tasks");
    }

    // FR-15 c2: Validate all assignees are current project members
    for (const assigneeId of data.assigneeIds) {
      const member = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, assigneeId);
      if (!member) {
        throw new ValidationError("Assignees must be project members", {
          assigneeIds: ["Assignees must be project members"],
        });
      }
    }

    const currentAssignees = await taskAssigneeRepository.findUserIdsByTaskId(ctx.db, taskId);
    const newAssignees = data.assigneeIds.filter((id) => !currentAssignees.includes(id));

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    // A17: update tasks.version (version guard); guard; delete task_assignees for the task; insert the new task_assignees; insert audit_logs TASK_ASSIGNED; insert notifications TASK_ASSIGNED (new assignees only)
    const batchItems: (AppBatchItem | null)[] = [
      taskRepository.updateVersionStmt(ctx.db, {
        id: taskId,
        expectedVersion: data.version,
        now,
      }),
      conflictGuardStmt(ctx.db),
      taskAssigneeRepository.deleteByTaskIdStmt(ctx.db, taskId),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskId, data.assigneeIds, now),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: ctx.user.id,
        action: "TASK_ASSIGNED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes: {
          assignees: { from: currentAssignees, to: data.assigneeIds },
        },
        createdAt: now,
      }),
      ...newAssignees.map((userId) =>
        notificationRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          userId,
          type: "TASK_ASSIGNED",
          entityId: taskId,
          projectId,
          payload: {
            title: existing.title,
            actorName: currentUser.fullName,
          },
          readAt: null,
          createdAt: now,
        }),
      ),
    ];

    try {
      await ctx.db.batch(compactBatch(batchItems));
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("This task was changed by someone else. Reload to see the latest version.");
      }
      throw error;
    }

    ctx.logger.info("Task assignees updated", {
      taskId,
      projectId,
      assigneeCount: data.assigneeIds.length,
      newAssigneesCount: newAssignees.length,
    });

    const detailData = await this.getTaskDetails(ctx, projectId, taskId);
    return detailData.task;
  },

  async archiveTask(ctx: RequestContext, projectId: string, taskId: string, rawInput: unknown): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const parsed = TaskArchiveSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid task archive data", fieldErrors);
    }

    const data: TaskArchiveInput = parsed.data;

    // Load project access (throws NotFoundError 404 for non-members)
    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const existing = await taskRepository.findById(ctx.db, taskId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    const currentAssignees = await taskAssigneeRepository.findUserIdsByTaskId(ctx.db, taskId);
    const target: TaskPolicyTarget = {
      createdById: existing.createdById,
      assigneeIds: currentAssignees,
      category: "TODO",
    };

    const actor = toActor(ctx.user, access);
    if (!canArchiveTask(actor, target)) {
      throw new ForbiddenError("You do not have permission to archive this task");
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    // A20: update tasks.deleted_at (version guard); guard; update tasks.deleted_at for its sub-tasks; insert audit_logs TASK_ARCHIVED
    const batchItems: (AppBatchItem | null)[] = [
      taskRepository.archiveWithVersionStmt(ctx.db, {
        id: taskId,
        expectedVersion: data.version,
        now,
      }),
      conflictGuardStmt(ctx.db),
      taskRepository.archiveSubtasksStmt(ctx.db, {
        parentTaskId: taskId,
        now,
      }),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: ctx.user.id,
        action: "TASK_ARCHIVED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes: {
          deletedAt: { from: null, to: now.toISOString() },
        },
        createdAt: now,
      }),
    ];

    try {
      await ctx.db.batch(compactBatch(batchItems));
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("This task was changed by someone else. Reload to see the latest version.");
      }
      throw error;
    }

    ctx.logger.info("Task archived", {
      taskId,
      projectId,
      actorId: ctx.user.id,
    });
  },
};
