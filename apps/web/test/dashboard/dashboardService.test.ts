import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@pm/domain";
import {
  createDatabase,
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { dashboardService } from "../../app/services/dashboard.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createTestContext(systemRole: "MEMBER" | "TEAM_LEAD" | "PM" | "ADMIN" = "MEMBER") {
  const db = createDatabase(env.DB);
  const now = new Date("2026-11-19T10:00:00+07:00");
  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `dash-${Date.now()}-${Math.random()}@example.com`,
    fullName: "Dashboard User",
    systemRole,
    status: "ACTIVE",
    passwordHash: "hash",
    passwordIterations: 100000,
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    db,
    env: {
      ...env,
      SESSION_SECRET: env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long",
      APP_BASE_URL: env.APP_BASE_URL || "http://localhost:3000",
    },
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "test-req-id",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => now },
  };

  return { ctx, user, now };
}

describe("dashboardService (FR-33)", () => {
  it("FR-33 c1: returns tasks in IN_PROGRESS, today's priorities (P19), and unread count", async () => {
    const { ctx, user, now } = await createTestContext("MEMBER");

    const projectId = crypto.randomUUID();
    const code = `DSH${Date.now().toString().slice(-4)}`;

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code,
        name: "Dashboard Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const statusTodoId = crypto.randomUUID();
    const statusInProgressId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await ctx.db.batch([
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusTodoId,
        name: `Todo ${statusTodoId.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusInProgressId,
        name: `In Progress ${statusInProgressId.slice(0, 4)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 2,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusDoneId,
        name: `Done ${statusDoneId.slice(0, 4)}`,
        category: "DONE",
        isDefault: false,
        position: 3,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Tasks:
    // 1. In progress, medium priority, future due date -> inProgress only
    const taskInProgressOnly = crypto.randomUUID();
    // 2. In progress, HIGH priority -> inProgress AND todayPriorities
    const taskHighInProgress = crypto.randomUUID();
    // 3. Todo, overdue (due 2026-11-18 < 2026-11-19) -> todayPriorities only
    const taskOverdueTodo = crypto.randomUUID();
    // 4. Todo, due today (2026-11-19) -> todayPriorities only
    const taskDueTodayTodo = crypto.randomUUID();
    // 5. Todo, normal priority, future due date -> neither
    const taskNormalTodo = crypto.randomUUID();
    // 6. Done task, overdue -> neither (Done tasks drop out)
    const taskDone = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: taskInProgressOnly,
        projectId,
        statusId: statusInProgressId,
        title: "In Progress Only Task",
        priority: "MEDIUM",
        dueDate: "2026-11-30",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskHighInProgress,
        projectId,
        statusId: statusInProgressId,
        title: "High Priority In Progress Task",
        priority: "HIGH",
        dueDate: "2026-11-30",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskOverdueTodo,
        projectId,
        statusId: statusTodoId,
        title: "Overdue Todo Task",
        priority: "LOW",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskDueTodayTodo,
        projectId,
        statusId: statusTodoId,
        title: "Due Today Todo Task",
        priority: "MEDIUM",
        dueDate: "2026-11-19",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskNormalTodo,
        projectId,
        statusId: statusTodoId,
        title: "Normal Future Todo Task",
        priority: "MEDIUM",
        dueDate: "2026-11-30",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskDone,
        projectId,
        statusId: statusDoneId,
        title: "Done Task",
        priority: "HIGH",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Assign all tasks to user
    const assignees1 = [
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskInProgressOnly, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskHighInProgress, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskOverdueTodo, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskDueTodayTodo, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskNormalTodo, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskDone, [user.id], now),
    ];
    const [firstAssignee1, ...restAssignees1] = assignees1;
    if (firstAssignee1) {
      await ctx.db.batch([firstAssignee1, ...restAssignees1]);
    }

    // Unread notifications: 2 unread, 1 read
    await ctx.db.batch([
      notificationRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        userId: user.id,
        type: "TASK_ASSIGNED",
        entityId: taskInProgressOnly,
        projectId,
        payload: {
          title: "In Progress Task",
          actorName: user.fullName,
        },
        createdAt: now,
        readAt: null,
      }),
      notificationRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        userId: user.id,
        type: "TASK_ASSIGNED",
        entityId: taskHighInProgress,
        projectId,
        payload: {
          title: "High Priority Task",
          actorName: user.fullName,
        },
        createdAt: now,
        readAt: null,
      }),
      notificationRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        userId: user.id,
        type: "TASK_ASSIGNED",
        entityId: taskDone,
        projectId,
        payload: {
          title: "Done Task",
          actorName: user.fullName,
        },
        createdAt: now,
        readAt: now,
      }),
    ]);

    const data = await dashboardService.getPersonalDashboard(ctx);

    expect(data.unreadCount).toBe(2);

    const inProgressIds = data.inProgress.map((t) => t.id);
    expect(inProgressIds).toContain(taskInProgressOnly);
    expect(inProgressIds).toContain(taskHighInProgress);
    expect(inProgressIds).not.toContain(taskOverdueTodo);
    expect(inProgressIds).not.toContain(taskDueTodayTodo);
    expect(inProgressIds).not.toContain(taskNormalTodo);
    expect(inProgressIds).not.toContain(taskDone);

    const todayPriorityIds = data.todayPriorities.map((t) => t.id);
    expect(todayPriorityIds).toContain(taskHighInProgress); // HIGH priority
    expect(todayPriorityIds).toContain(taskOverdueTodo); // Overdue
    expect(todayPriorityIds).toContain(taskDueTodayTodo); // Due today
    expect(todayPriorityIds).not.toContain(taskInProgressOnly); // Normal future
    expect(todayPriorityIds).not.toContain(taskNormalTodo);
    expect(todayPriorityIds).not.toContain(taskDone); // Done
  });

  it("FR-33 c2: tasks in projects user can no longer access or archived projects are not shown", async () => {
    const { ctx, user, now } = await createTestContext("MEMBER");

    const projectAccessibleId = crypto.randomUUID();
    const projectNoAccessId = crypto.randomUUID();
    const projectArchivedId = crypto.randomUUID();

    const code = Date.now().toString().slice(-4);

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectAccessibleId,
        code: `ACC${code}`,
        name: "Accessible Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(ctx.db, {
        id: projectNoAccessId,
        code: `NOA${code}`,
        name: "No Access Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(ctx.db, {
        id: projectArchivedId,
        code: `ARC${code}`,
        name: "Archived Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
      // Membership only in projectAccessibleId and projectArchivedId
      projectMemberRepository.insertStmt(ctx.db, {
        projectId: projectAccessibleId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId: projectArchivedId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const statusInProgressId = crypto.randomUUID();
    await ctx.db.batch([
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusInProgressId,
        name: `In Progress ${statusInProgressId.slice(0, 4)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const taskAccessible = crypto.randomUUID();
    const taskNoAccess = crypto.randomUUID();
    const taskArchived = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: taskAccessible,
        projectId: projectAccessibleId,
        statusId: statusInProgressId,
        title: "Accessible In Progress",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskNoAccess,
        projectId: projectNoAccessId,
        statusId: statusInProgressId,
        title: "No Access In Progress",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: taskArchived,
        projectId: projectArchivedId,
        statusId: statusInProgressId,
        title: "Archived Project Task",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const assignees2 = [
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskAccessible, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskNoAccess, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskArchived, [user.id], now),
    ];
    const [firstAssignee2, ...restAssignees2] = assignees2;
    if (firstAssignee2) {
      await ctx.db.batch([firstAssignee2, ...restAssignees2]);
    }

    const data = await dashboardService.getPersonalDashboard(ctx);

    const inProgressIds = data.inProgress.map((t) => t.id);
    expect(inProgressIds).toContain(taskAccessible);
    expect(inProgressIds).not.toContain(taskNoAccess);
    expect(inProgressIds).not.toContain(taskArchived);

    const todayPriorityIds = data.todayPriorities.map((t) => t.id);
    expect(todayPriorityIds).toContain(taskAccessible);
    expect(todayPriorityIds).not.toContain(taskNoAccess);
    expect(todayPriorityIds).not.toContain(taskArchived);
  });

  it("FR-33 c3: getAdminDashboard returns projectsAtRisk filtered by role permissions", async () => {
    // Admin context
    const { ctx: adminCtx, user: adminUser, now } = await createTestContext("ADMIN");
    // PM context
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    // Member context
    const { ctx: memberCtx } = await createTestContext("MEMBER");

    const p1Id = crypto.randomUUID();
    const p2Id = crypto.randomUUID();
    const code = Date.now().toString().slice(-4);

    await adminCtx.db.batch([
      projectRepository.insertStmt(adminCtx.db, {
        id: p1Id,
        code: `R1${code}`,
        name: "Project 1 With Overdue",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: adminUser.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(adminCtx.db, {
        id: p2Id,
        code: `R2${code}`,
        name: "Project 2 With Overdue",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: adminUser.id,
        createdAt: now,
        updatedAt: now,
      }),
      // PM is a member of p1Id only
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId: p1Id,
        userId: pmUser.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const statusTodoId = crypto.randomUUID();
    await adminCtx.db.batch([
      taskStatusRepository.insertStmt(adminCtx.db, {
        id: statusTodoId,
        name: `TodoRisk ${statusTodoId.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Insert overdue task in p1 and p2 (due 2026-11-18 < 2026-11-19)
    await adminCtx.db.batch([
      taskRepository.insertStmt(adminCtx.db, {
        id: crypto.randomUUID(),
        projectId: p1Id,
        statusId: statusTodoId,
        title: "Overdue in P1",
        dueDate: "2026-11-18",
        createdById: adminUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(adminCtx.db, {
        id: crypto.randomUUID(),
        projectId: p2Id,
        statusId: statusTodoId,
        title: "Overdue in P2",
        dueDate: "2026-11-18",
        createdById: adminUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Admin sees both p1 and p2 in projectsAtRisk
    const adminData = await dashboardService.getAdminDashboard(adminCtx);
    const adminRiskProjectIds = adminData.projectsAtRisk.map((p) => p.id);
    expect(adminRiskProjectIds).toContain(p1Id);
    expect(adminRiskProjectIds).toContain(p2Id);

    // PM sees only p1 (since PM is member of p1 only)
    const pmData = await dashboardService.getAdminDashboard(pmCtx);
    const pmRiskProjectIds = pmData.projectsAtRisk.map((p) => p.id);
    expect(pmRiskProjectIds).toContain(p1Id);
    expect(pmRiskProjectIds).not.toContain(p2Id);

    // Member gets ForbiddenError (403)
    await expect(dashboardService.getAdminDashboard(memberCtx)).rejects.toThrow(ForbiddenError);
  });
});
