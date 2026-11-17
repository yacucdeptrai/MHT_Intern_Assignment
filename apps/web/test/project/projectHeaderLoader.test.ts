import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { projectHeaderLoader } from "../../app/loaders/projectHeaderLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createAuthenticatedRequest(
  urlStr: string,
  user: { id: string; email: string; fullName: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" },
): Promise<{ request: Request; ctx: RequestContext }> {
  const db = createDatabase(env.DB);
  const now = new Date();

  await userRepository.insert(db, {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    systemRole: user.systemRole,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
  session.set("userId", user.id);
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
    clock: { now: () => new Date() },
  };

  return { request, ctx };
}

describe("projectHeaderLoader (M2-T2)", () => {
  it("throws redirect to /login when unauthenticated", async () => {
    const db = createDatabase(env.DB);
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
      clock: { now: () => new Date() },
    };

    const request = new Request("http://localhost/projects/proj-1");
    await expect(projectHeaderLoader(ctx, request, "proj-1")).rejects.toMatchObject({
      status: 302,
    });
  });

  it("returns project header and permissions for project member", async () => {
    const db = createDatabase(env.DB);
    const memberId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const now = new Date();

    const { request, ctx } = await createAuthenticatedRequest(`http://localhost/projects/${projectId}`, {
      id: memberId,
      email: "member@example.com",
      fullName: "Member User",
      systemRole: "MEMBER",
    });

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "PRJ-MEM",
        name: "Member Project",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: memberId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: memberId,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const data = await projectHeaderLoader(ctx, request, projectId);
    expect(data.project.id).toBe(projectId);
    expect(data.project.code).toBe("PRJ-MEM");
    expect(data.permissions.canManageProject).toBe(true);
  });

  it("throws 404 Response for non-member", async () => {
    const db = createDatabase(env.DB);
    const nonMemberId = crypto.randomUUID();
    const creatorId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const now = new Date();

    const { request, ctx } = await createAuthenticatedRequest(`http://localhost/projects/${projectId}`, {
      id: nonMemberId,
      email: "nonmember@example.com",
      fullName: "Non Member",
      systemRole: "MEMBER",
    });

    await userRepository.insert(db, {
      id: creatorId,
      email: "creator@example.com",
      fullName: "Creator User",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "PRJ-SEC",
        name: "Secret Project",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creatorId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: creatorId,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    try {
      await projectHeaderLoader(ctx, request, projectId);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("throws 404 Response for non-existent project", async () => {
    const adminId = crypto.randomUUID();
    const { request, ctx } = await createAuthenticatedRequest("http://localhost/projects/non-existent", {
      id: adminId,
      email: "admin@example.com",
      fullName: "Admin User",
      systemRole: "ADMIN",
    });

    try {
      await projectHeaderLoader(ctx, request, "non-existent");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });
});
