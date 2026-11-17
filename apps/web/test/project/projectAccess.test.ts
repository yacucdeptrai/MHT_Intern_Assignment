import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository } from "@pm/db";
import { NotFoundError, UnauthorizedError } from "@pm/domain";

import { loadProjectAccess } from "../../app/utils/auth.server";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { createUser } from "../factories";

function makeContext(db: ReturnType<typeof createDatabase>, user: RequestContext["user"] = null): RequestContext {
  return {
    env,
    db,
    user,
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
}

describe("loadProjectAccess guard (docs/05 §2 & §5.2)", () => {
  it("throws UnauthorizedError when ctx.user is null", async () => {
    const db = createDatabase(env.DB);
    const ctx = makeContext(db, null);

    await expect(loadProjectAccess(ctx, "any-id")).rejects.toThrow(UnauthorizedError);
  });

  it("throws NotFoundError when project does not exist", async () => {
    const db = createDatabase(env.DB);
    const user = await createUser(db, { systemRole: "MEMBER" });
    const ctx = makeContext(db, {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: "ACTIVE",
    });

    await expect(loadProjectAccess(ctx, "non-existent-id")).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError (never 403) for non-members on active project", async () => {
    const db = createDatabase(env.DB);
    const creator = await createUser(db, { systemRole: "PM" });
    const nonMember = await createUser(db, { systemRole: "MEMBER" });

    const projectId = crypto.randomUUID();
    const now = new Date();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "ACTIVE-1",
        name: "Active Project 1",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: creator.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const ctx = makeContext(db, {
      id: nonMember.id,
      email: nonMember.email,
      fullName: nonMember.fullName,
      systemRole: nonMember.systemRole,
      status: "ACTIVE",
    });

    await expect(loadProjectAccess(ctx, projectId)).rejects.toThrow(NotFoundError);
  });

  it("returns membership with project role for project member", async () => {
    const db = createDatabase(env.DB);
    const member = await createUser(db, { systemRole: "MEMBER" });

    const projectId = crypto.randomUUID();
    const now = new Date();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "ACTIVE-2",
        name: "Active Project 2",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: member.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: member.id,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
    ]);

    const ctx = makeContext(db, {
      id: member.id,
      email: member.email,
      fullName: member.fullName,
      systemRole: member.systemRole,
      status: "ACTIVE",
    });

    const access = await loadProjectAccess(ctx, projectId);
    expect(access).toMatchObject({
      projectRole: "TEAM_LEAD",
      isAdmin: false,
      isArchived: false,
    });
    expect(access.project.id).toBe(projectId);
  });

  it("returns PM access for Admin on active project without explicit membership", async () => {
    const db = createDatabase(env.DB);
    const creator = await createUser(db, { systemRole: "PM" });
    const admin = await createUser(db, { systemRole: "ADMIN" });

    const projectId = crypto.randomUUID();
    const now = new Date();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "ACTIVE-3",
        name: "Active Project 3",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: creator.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const ctx = makeContext(db, {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      systemRole: admin.systemRole,
      status: "ACTIVE",
    });

    const access = await loadProjectAccess(ctx, projectId);
    expect(access).toMatchObject({
      projectRole: "PM",
      isAdmin: true,
      isArchived: false,
    });
  });

  it("returns read-only PM access for Admin on archived project", async () => {
    const db = createDatabase(env.DB);
    const creator = await createUser(db, { systemRole: "PM" });
    const admin = await createUser(db, { systemRole: "ADMIN" });

    const projectId = crypto.randomUUID();
    const now = new Date();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "ARCH-1",
        name: "Archived Project 1",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: creator.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const ctx = makeContext(db, {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      systemRole: admin.systemRole,
      status: "ACTIVE",
    });

    const access = await loadProjectAccess(ctx, projectId);
    expect(access).toMatchObject({
      projectRole: "PM",
      isAdmin: true,
      isArchived: true,
    });
  });

  it("throws NotFoundError for non-admin member on archived project", async () => {
    const db = createDatabase(env.DB);
    const member = await createUser(db, { systemRole: "MEMBER" });

    const projectId = crypto.randomUUID();
    const now = new Date();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "ARCH-2",
        name: "Archived Project 2",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: member.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: member.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const ctx = makeContext(db, {
      id: member.id,
      email: member.email,
      fullName: member.fullName,
      systemRole: member.systemRole,
      status: "ACTIVE",
    });

    await expect(loadProjectAccess(ctx, projectId)).rejects.toThrow(NotFoundError);
  });
});
