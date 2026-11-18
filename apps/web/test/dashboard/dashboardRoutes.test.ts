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
import type { SystemRole } from "@pm/domain";

import { loader as adminIndexLoader } from "../../app/routes/_app.admin._index";
import { loader as memberIndexLoader } from "../../app/routes/_app._index";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: SystemRole,
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date("2026-11-19T10:00:00+07:00");
  const userId = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${userId}@example.com`;

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
  session.set("userId", userId);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

  const headers = new Headers();
  headers.set("Cookie", cookie);

  const request = new Request(urlStr, { headers });
  const ctx: RequestContext = {
    env,
    db,
    user: null,
    requestId: "test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => now },
  };

  return { request, ctx, userId };
}

function makeLoaderArgs(request: Request, ctx: RequestContext) {
  const map = new Map<unknown, unknown>();
  map.set(requestContextKey, ctx);
  return {
    request,
    params: {},
    context: map,
  } as unknown as Parameters<typeof memberIndexLoader>[0];
}

describe("Dashboard Routes and Loaders (FR-33)", () => {
  it("FR-33 c1: member loading / receives personal dashboard data with inProgress and todayPriorities", async () => {
    const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost/", "MEMBER");
    const now = ctx.clock.now();

    const projectId = crypto.randomUUID();
    const statusInProgressId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: `MBR${Date.now().toString().slice(-4)}`,
        name: "Member Dashboard Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusInProgressId,
        name: "In Progress",
        category: "IN_PROGRESS",
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
        statusId: statusInProgressId,
        title: "Active In Progress Task",
        priority: "HIGH",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(ctx.db, taskId, [userId], now),
    ]);

    const result = await memberIndexLoader(makeLoaderArgs(request, ctx));
    expect(result.user.systemRole).toBe("MEMBER");
    expect(result.inProgress.some((t) => t.id === taskId)).toBe(true);
    expect(result.todayPriorities.some((t) => t.id === taskId)).toBe(true);
    expect(typeof result.unreadCount).toBe("number");
  });

  it("FR-33 c3: admin loading /admin receives personal dashboard plus projectsAtRisk", async () => {
    const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost/admin", "ADMIN");
    const now = ctx.clock.now();

    const projectId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: `ADM${Date.now().toString().slice(-4)}`,
        name: "Admin Risk Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(ctx.db, {
        id: statusTodoId,
        name: "Todo",
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        projectId,
        statusId: statusTodoId,
        title: "Overdue task for admin",
        dueDate: "2026-11-15",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const result = await adminIndexLoader(makeLoaderArgs(request, ctx));
    expect(result.user.systemRole).toBe("ADMIN");
    expect(result.projectsAtRisk.some((p) => p.id === projectId)).toBe(true);
    const risk = result.projectsAtRisk.find((p) => p.id === projectId);
    expect(risk?.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it("FR-33 c2: member attempting to access /admin throws 403 Forbidden", async () => {
    const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin", "MEMBER");
    await expect(adminIndexLoader(makeLoaderArgs(request, ctx))).rejects.toThrow();
  });
});
