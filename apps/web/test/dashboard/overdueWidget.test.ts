import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { dashboardService } from "../../app/services/dashboard.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createTestContext() {
  const db = createDatabase(env.DB);
  const now = new Date("2026-11-20T10:00:00+07:00"); // Asia/Ho_Chi_Minh
  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `overdue-${Date.now()}-${Math.random()}@example.com`,
    fullName: "Overdue User",
    systemRole: "MEMBER",
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

describe("overdueWidget (FR-34)", () => {
  it("FR-34 c1: lists overdue tasks most overdue first with days overdue computed in APP_TIMEZONE", async () => {
    const { ctx, user, now } = await createTestContext();

    const projectId = crypto.randomUUID();
    const code = `OD${Date.now().toString().slice(-4)}`;

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code,
        name: "Overdue Project",
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
    ]);

    // Tasks with different due dates:
    // Today is 2026-11-20 in Asia/Ho_Chi_Minh
    const t5Days = crypto.randomUUID(); // 2026-11-15 -> 5 days overdue
    const t2Days = crypto.randomUUID(); // 2026-11-18 -> 2 days overdue
    const t1Day = crypto.randomUUID(); // 2026-11-19 -> 1 day overdue
    const tToday = crypto.randomUUID(); // 2026-11-20 -> due today, not overdue
    const tFuture = crypto.randomUUID(); // 2026-11-25 -> future

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: t5Days,
        projectId,
        statusId: statusTodoId,
        title: "Task 5 Days Overdue",
        dueDate: "2026-11-15",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: t2Days,
        projectId,
        statusId: statusTodoId,
        title: "Task 2 Days Overdue",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: t1Day,
        projectId,
        statusId: statusTodoId,
        title: "Task 1 Day Overdue",
        dueDate: "2026-11-19",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: tToday,
        projectId,
        statusId: statusTodoId,
        title: "Task Due Today",
        dueDate: "2026-11-20",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: tFuture,
        projectId,
        statusId: statusTodoId,
        title: "Future Task",
        dueDate: "2026-11-25",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const assignees = [
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t5Days, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t2Days, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t1Day, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, tToday, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, tFuture, [user.id], now),
    ];
    const [firstA, ...restA] = assignees;
    if (firstA) {
      await ctx.db.batch([firstA, ...restA]);
    }

    const data = await dashboardService.getPersonalDashboard(ctx);

    expect(data.overdue).toBeDefined();
    expect(data.overdue.length).toBe(3);

    // Most overdue first (highest daysOverdue first)
    expect(data.overdue[0]?.id).toBe(t5Days);
    expect(data.overdue[0]?.daysOverdue).toBe(5);
    expect(data.overdue[0]?.dueDate).toBe("2026-11-15");

    expect(data.overdue[1]?.id).toBe(t2Days);
    expect(data.overdue[1]?.daysOverdue).toBe(2);
    expect(data.overdue[1]?.dueDate).toBe("2026-11-18");

    expect(data.overdue[2]?.id).toBe(t1Day);
    expect(data.overdue[2]?.daysOverdue).toBe(1);
    expect(data.overdue[2]?.dueDate).toBe("2026-11-19");
  });

  it("FR-34 c2: task that becomes Done drops out on reload", async () => {
    const { ctx, user, now } = await createTestContext();

    const projectId = crypto.randomUUID();
    const code = `DD${Date.now().toString().slice(-4)}`;

    const statusTodoId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code,
        name: "Done Test Project",
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
        id: statusDoneId,
        name: `Done ${statusDoneId.slice(0, 4)}`,
        category: "DONE",
        isDefault: false,
        position: 2,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const taskId = crypto.randomUUID();
    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: taskId,
        projectId,
        statusId: statusTodoId,
        title: "Will Become Done",
        dueDate: "2026-11-15",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskId, [user.id], now),
    ]);

    // Initial load: task is overdue
    const initialData = await dashboardService.getPersonalDashboard(ctx);
    expect(initialData.overdue.some((t) => t.id === taskId)).toBe(true);

    // Update status to DONE
    await ctx.db.batch([
      taskRepository.updateStatusStmt(ctx.db, {
        id: taskId,
        statusId: statusDoneId,
        expectedVersion: 1,
        now,
      }),
    ]);

    // Reload dashboard: task must no longer appear in overdue
    const reloadedData = await dashboardService.getPersonalDashboard(ctx);
    expect(reloadedData.overdue.some((t) => t.id === taskId)).toBe(false);
  });

  it("FR-34 c2: task that becomes archived drops out on reload", async () => {
    const { ctx, user, now } = await createTestContext();

    const projectId = crypto.randomUUID();
    const code = `AR${Date.now().toString().slice(-4)}`;
    const statusTodoId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code,
        name: "Archive Test Project",
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
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusTodoId,
        name: `Todo ${statusTodoId.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const taskId = crypto.randomUUID();
    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: taskId,
        projectId,
        statusId: statusTodoId,
        title: "Will Be Archived",
        dueDate: "2026-11-15",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskId, [user.id], now),
    ]);

    // Initial load: task is overdue
    const initialData = await dashboardService.getPersonalDashboard(ctx);
    expect(initialData.overdue.some((t) => t.id === taskId)).toBe(true);

    // Archive task
    await ctx.db.batch([taskRepository.archiveStmt(ctx.db, taskId, now)]);

    // Reload dashboard: task must no longer appear in overdue
    const reloadedData = await dashboardService.getPersonalDashboard(ctx);
    expect(reloadedData.overdue.some((t) => t.id === taskId)).toBe(false);
  });
});
