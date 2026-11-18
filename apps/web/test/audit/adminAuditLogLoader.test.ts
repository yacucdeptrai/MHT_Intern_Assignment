import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, userRepository } from "@pm/db";

import { adminAuditLogLoader } from "../../app/loaders/adminAuditLogLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `audit-ldr-${role.toLowerCase()}-${userId}@example.com`;

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: `${role} Loader Tester`,
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
    requestId: "audit-loader-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { request, ctx, userId };
}

describe("adminAuditLogLoader (FR-24 c2, c4)", () => {
  it("FR-24 c2: loads filtered, paginated audit entries (newest first, 50 per page) for ADMIN", async () => {
    const { ctx, userId } = await createAuthenticatedRequest("http://localhost/admin/audit-log", "ADMIN");
    const entityId = crypto.randomUUID();

    await ctx.db.batch([
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: userId,
        action: "USER_CREATED",
        entityType: "USER",
        entityId,
        projectId: null,
        changes: { email: { from: null, to: "first@example.com" } },
        createdAt: new Date("2026-11-18T04:00:00.000Z"),
      }),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: userId,
        action: "USER_ROLE_CHANGED",
        entityType: "USER",
        entityId,
        projectId: null,
        changes: { systemRole: { from: "MEMBER", to: "TEAM_LEAD" } },
        createdAt: new Date("2026-11-18T05:00:00.000Z"),
      }),
    ]);

    const { request } = await (async () => {
      const urlStr = `http://localhost/admin/audit-log?actorId=${userId}&entityType=USER&action=USER_ROLE_CHANGED&from=2026-11-18&to=2026-11-18`;
      const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
      session.set("userId", userId);
      const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });
      return { request: new Request(urlStr, { headers: { Cookie: cookie } }) };
    })();

    const data = await adminAuditLogLoader(ctx, request);
    expect(data.entries.pageSize).toBe(50);
    expect(data.entries.total).toBe(1);
    expect(data.entries.items[0]?.action).toBe("USER_ROLE_CHANGED");
    expect(data.entries.items[0]?.entityId).toBe(entityId);
    expect(data.filters.actorId).toBe(userId);
    expect(data.actors.some((a) => a.id === userId)).toBe(true);
  });

  it("FR-24 c4: throws 403 Response when PM, TEAM_LEAD, or MEMBER requests /admin/audit-log", async () => {
    for (const role of ["PM", "TEAM_LEAD", "MEMBER"] as const) {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/audit-log", role);
      let caught: unknown;
      try {
        await adminAuditLogLoader(ctx, request);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Response);
      expect((caught as Response).status).toBe(403);
    }
  });

  it("redirects unauthenticated user to login with redirectTo query parameter", async () => {
    const db = createDatabase(env.DB);
    const ctx: RequestContext = {
      env,
      db,
      user: null,
      requestId: "anon-audit-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => new Date() },
    };

    let caught: unknown;
    try {
      await adminAuditLogLoader(ctx, new Request("http://localhost/admin/audit-log"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Response);
    const res = caught as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/login?redirectTo=${encodeURIComponent("/admin/audit-log")}`);
  });

  it("returns 400 Response on invalid query filter parameters", async () => {
    const { request, ctx } = await createAuthenticatedRequest(
      "http://localhost/admin/audit-log?from=2026-11-25&to=2026-11-10",
      "ADMIN",
    );

    let caught: unknown;
    try {
      await adminAuditLogLoader(ctx, request);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(400);
  });
});
