import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import type { SystemRole } from "@pm/domain";
import { NotFoundError } from "@pm/domain";

import { loader as calendarRouteLoader } from "../../app/routes/_app.calendar";
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
  const email = `cal-route-${role.toLowerCase()}-${userId}@example.com`;

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: `${role} Calendar User`,
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
    requestId: "cal-route-req",
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
  } as unknown as Parameters<typeof calendarRouteLoader>[0];
}

describe("Calendar Route (FR-35)", () => {
  it("FR-35 c1: loader returns month calendar data with spans and single day tasks", async () => {
    const { request, ctx, userId } = await createAuthenticatedRequest(
      "http://localhost/calendar?view=month&date=2026-11-19",
      "MEMBER",
    );
    const now = ctx.clock.now();

    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: `RCA${Date.now().toString().slice(-4)}`,
        name: "Route Calendar Project",
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
        id: statusId,
        name: `CalStatus-${crypto.randomUUID().slice(0, 5)}`,
        category: "IN_PROGRESS",
        isDefault: true,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const spanTaskId = crypto.randomUUID();
    const singleTaskId = crypto.randomUUID();
    const noDateTaskId = crypto.randomUUID();

    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: spanTaskId,
        projectId,
        statusId,
        title: "Span Route Task",
        startDate: "2026-11-05",
        dueDate: "2026-11-15",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: singleTaskId,
        projectId,
        statusId,
        title: "Single Day Route Task",
        dueDate: "2026-11-19",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: noDateTaskId,
        projectId,
        statusId,
        title: "No Date Route Task",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const result = await calendarRouteLoader(makeLoaderArgs(request, ctx));
    expect(result.view).toBe("month");
    expect(result.date).toBe("2026-11-19");
    expect(result.range.from).toBe("2026-11-01");
    expect(result.range.to).toBe("2026-11-30");

    const spanEvent = result.events.find((e) => e.id === spanTaskId);
    expect(spanEvent).toBeDefined();
    expect(spanEvent?.isSpan).toBe(true);

    const singleEvent = result.events.find((e) => e.id === singleTaskId);
    expect(singleEvent).toBeDefined();
    expect(singleEvent?.isSpan).toBe(false);

    expect(result.events.some((e) => e.id === noDateTaskId)).toBe(false);
  });

  it("FR-35 c2 / P3: returns 404 when filtering by non-accessible project", async () => {
    const { request, ctx } = await createAuthenticatedRequest(
      `http://localhost/calendar?projectId=${crypto.randomUUID()}`,
      "MEMBER",
    );
    await expect(calendarRouteLoader(makeLoaderArgs(request, ctx))).rejects.toThrow(NotFoundError);
  });

  it("FR-35 c3: supports view and date parameters in URL", async () => {
    const { request, ctx } = await createAuthenticatedRequest(
      "http://localhost/calendar?view=week&date=2026-11-19",
      "MEMBER",
    );
    const result = await calendarRouteLoader(makeLoaderArgs(request, ctx));
    expect(result.view).toBe("week");
    expect(result.date).toBe("2026-11-19");
    expect(result.range.from).toBe("2026-11-16");
    expect(result.range.to).toBe("2026-11-22");
  });
});
