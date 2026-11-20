import type {
  AdminDashboardLoaderData,
  DashboardLoaderData,
  OverdueItem,
  TaskAssigneeInfo,
  TaskListItem,
} from "@pm/domain";
import {
  calculateDaysOverdue,
  ForbiddenError,
  getTodayDateString,
  isDueSoon,
  isOverdue,
  isTodayPriority,
  UnauthorizedError,
} from "@pm/domain";
import {
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
} from "@pm/db";

import type { RequestContext } from "../utils/requestContext.server";

export const dashboardService = {
  async getPersonalDashboard(ctx: RequestContext): Promise<DashboardLoaderData> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
    }

    const now = ctx.clock.now();
    const isAdmin = ctx.user.systemRole === "ADMIN";

    let allowedProjectIds: string[] | undefined;
    if (!isAdmin) {
      const memberships = await projectMemberRepository.listByUser(ctx.db, ctx.user.id);
      allowedProjectIds = memberships.map((m) => m.projectId);
    }

    const [rawTasks, unreadCount] = await Promise.all([
      taskRepository.listDashboardTasks(ctx.db, {
        userId: ctx.user.id,
        allowedProjectIds,
      }),
      notificationRepository.countUnread(ctx.db, ctx.user.id),
    ]);

    const taskIds = rawTasks.map((t) => t.id);
    const assigneesByTaskId = new Map<string, TaskAssigneeInfo[]>();
    if (taskIds.length > 0) {
      const assignees = await taskAssigneeRepository.findByTaskIdsWithUser(ctx.db, taskIds);
      for (const a of assignees) {
        const list = assigneesByTaskId.get(a.taskId) ?? [];
        list.push({ id: a.userId, fullName: a.fullName, avatarKey: a.avatarKey });
        assigneesByTaskId.set(a.taskId, list);
      }
    }

    const taskListItems: TaskListItem[] = rawTasks.map((task) => ({
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
      createdAt: task.createdAt instanceof Date ? task.createdAt.getTime() : Number(task.createdAt),
      updatedAt: task.updatedAt instanceof Date ? task.updatedAt.getTime() : Number(task.updatedAt),
    }));

    const inProgress = taskListItems.filter((t) => t.statusCategory === "IN_PROGRESS");
    const inReview = taskListItems.filter((t) => t.statusCategory === "REVIEW");
    const todayPriorities = taskListItems.filter((t) => t.isTodayPriority);

    const overdue: OverdueItem[] = taskListItems
      .filter((t) => t.isOverdue && t.dueDate)
      .map((t) => ({
        id: t.id,
        projectId: t.projectId,
        projectCode: t.projectCode,
        projectName: t.projectName,
        number: t.number,
        title: t.title,
        dueDate: t.dueDate as string,
        daysOverdue: calculateDaysOverdue(t.dueDate as string, now),
        priority: t.priority,
        statusName: t.statusName,
        statusCategory: t.statusCategory,
      }))
      .sort((a, b) => {
        if (b.daysOverdue !== a.daysOverdue) {
          return b.daysOverdue - a.daysOverdue;
        }
        return a.dueDate.localeCompare(b.dueDate);
      });

    return {
      inProgress,
      inReview,
      todayPriorities,
      overdue,
      unreadCount,
    };
  },

  async getAdminDashboard(ctx: RequestContext): Promise<AdminDashboardLoaderData> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
    }

    if (ctx.user.systemRole !== "ADMIN" && ctx.user.systemRole !== "PM") {
      throw new ForbiddenError("Insufficient permissions", { key: "errors.insufficient_permissions" });
    }

    const now = ctx.clock.now();
    const todayStr = getTodayDateString(now);

    let allowedProjectIds: string[] | undefined;
    if (ctx.user.systemRole === "PM") {
      const memberships = await projectMemberRepository.listByUser(ctx.db, ctx.user.id);
      allowedProjectIds = memberships.map((m) => m.projectId);
    }

    const [personalDashboard, projectsAtRisk] = await Promise.all([
      this.getPersonalDashboard(ctx),
      projectRepository.listProjectsAtRisk(ctx.db, {
        todayStr,
        allowedProjectIds,
      }),
    ]);

    const pms = await projectMemberRepository.listPmNamesByProjects(
      ctx.db,
      projectsAtRisk.map((project) => project.id),
    );
    const pmByProject = new Map<string, string>();
    for (const pm of pms) {
      if (!pmByProject.has(pm.projectId)) {
        pmByProject.set(pm.projectId, pm.fullName);
      }
    }

    return {
      ...personalDashboard,
      projectsAtRisk: projectsAtRisk.map((project) => ({ ...project, pmName: pmByProject.get(project.id) ?? null })),
    };
  },
};
