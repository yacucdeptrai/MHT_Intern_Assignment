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

import { myTasksLoader } from "../../app/loaders/myTasksLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestContext(systemRole: "MEMBER" | "TEAM_LEAD" | "PM" | "ADMIN" = "MEMBER") {
  const db = createDatabase(env.DB);
  const now = new Date();
  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `my-tasks-${Date.now()}-${Math.random()}@example.com`,
    fullName: "My Tasks User",
    systemRole,
    status: "ACTIVE",
    passwordHash: "hash",
    passwordIterations: 100000,
    createdAt: now,
    updatedAt: now,
  });

  const secret = env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long";
  const session = await getSession(new Request("http://localhost"), secret);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret });

  const ctx: RequestContext = {
    db,
    env: {
      ...env,
      SESSION_SECRET: secret,
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
    clock: { now: () => new Date() },
  };

  return { ctx, user, cookie };
}

async function createProject(ctx: RequestContext, codePrefix: string) {
  const now = new Date();
  const projectId = crypto.randomUUID();
  const code = `${codePrefix}${Date.now().toString().slice(-4)}`;
  await ctx.db.batch([
    projectRepository.insertStmt(ctx.db, {
      id: projectId,
      code,
      name: `Project ${code}`,
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: ctx.user?.id ?? "test-admin-id",
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return { projectId, code };
}

describe("myTasksLoader (FR-16)", () => {
  it("FR-16 c1: returns assigned tasks across accessible projects", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId: p1 } = await createProject(ctx, "P1");
    const { projectId: p2 } = await createProject(ctx, "P2");
    const { projectId: p3 } = await createProject(ctx, "P3"); // not a member

    const now = new Date();
    const statusId = crypto.randomUUID();

    await ctx.db.batch([
      // Add membership to p1 and p2 only
      projectMemberRepository.insertStmt(ctx.db, {
        projectId: p1,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId: p2,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusId,
        name: `In Progress 1 ${Date.now()}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 10,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Create 3 tasks: 1 in p1 (assigned to user), 1 in p2 (assigned to user), 1 in p3 (assigned to user but user has no project access)
    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    const t3 = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: t1,
        projectId: p1,
        statusId,
        title: "P1 Assigned Task",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: t2,
        projectId: p2,
        statusId,
        title: "P2 Assigned Task",
        priority: "MEDIUM",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: t3,
        projectId: p3,
        statusId,
        title: "P3 Inaccessible Task",
        priority: "LOW",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t1, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t2, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, t3, [user.id], now),
    ]);

    const req = new Request("http://localhost/my-tasks", {
      headers: { Cookie: cookie },
    });
    const data = await myTasksLoader(ctx, req);

    expect(data.tasks.total).toBe(2);
    expect(data.tasks.items).toHaveLength(2);
    expect(data.tasks.items.some((t) => t.id === t1)).toBe(true);
    expect(data.tasks.items.some((t) => t.id === t2)).toBe(true);
    // Task in inaccessible project p3 must NOT be returned
    expect(data.tasks.items.some((t) => t.id === t3)).toBe(false);
  });

  it("FR-16 c3: URL filters apply correctly to /my-tasks", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx, "FLT");
    const now = new Date();
    const statusId = crypto.randomUUID();

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusId,
        name: `In Progress 1 ${Date.now()}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 10,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const tHigh = crypto.randomUUID();
    const tLow = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: tHigh,
        projectId,
        statusId,
        title: "High Priority Task",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: tLow,
        projectId,
        statusId,
        title: "Low Priority Task",
        priority: "LOW",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, tHigh, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, tLow, [user.id], now),
    ]);

    const req = new Request("http://localhost/my-tasks?priority=HIGH", {
      headers: { Cookie: cookie },
    });
    const data = await myTasksLoader(ctx, req);

    expect(data.tasks.total).toBe(1);
    expect(data.tasks.items[0]?.id).toBe(tHigh);
    expect(data.filters.priority).toBe("HIGH");
  });

  it("redirects unauthenticated user to /login", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const req = new Request("http://localhost/my-tasks");
    await expect(myTasksLoader(ctx, req)).rejects.toMatchObject({
      status: 302,
    });
  });
});
