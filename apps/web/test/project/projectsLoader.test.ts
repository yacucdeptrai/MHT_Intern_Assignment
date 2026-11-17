import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { projectsLoader } from "../../app/loaders/projectsLoader";
import { commitSession, getSession } from "../../app/utils/session.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createTestContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
): Promise<{ ctx: RequestContext; cookie: string; user: { id: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${id}-${Date.now()}@example.com`;

  const user = await userRepository.insert(db, {
    id,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request("http://localhost"), env.SESSION_SECRET);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET });

  const ctx: RequestContext = {
    env,
    db,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: user.status,
    },
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

  return { ctx, cookie, user };
}

describe("projectsLoader", () => {
  it("returns canCreate = true for Admin and PM, false for Member and Team Lead", async () => {
    const admin = await createTestContext("ADMIN");
    const adminData = await projectsLoader(
      admin.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: admin.cookie } }),
    );
    expect(adminData.canCreate).toBe(true);

    const pm = await createTestContext("PM");
    const pmData = await projectsLoader(
      pm.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: pm.cookie } }),
    );
    expect(pmData.canCreate).toBe(true);

    const member = await createTestContext("MEMBER");
    const memberData = await projectsLoader(
      member.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: member.cookie } }),
    );
    expect(memberData.canCreate).toBe(false);

    const lead = await createTestContext("TEAM_LEAD");
    const leadData = await projectsLoader(
      lead.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: lead.cookie } }),
    );
    expect(leadData.canCreate).toBe(false);
  });

  it("returns projects accessible to user", async () => {
    const pm = await createTestContext("PM");
    const now = new Date();
    const pId = crypto.randomUUID();

    await pm.ctx.db.batch([
      projectRepository.insertStmt(pm.ctx.db, {
        id: pId,
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        name: "Visible Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(pm.ctx.db, {
        projectId: pId,
        userId: pm.user.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const data = await projectsLoader(
      pm.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: pm.cookie } }),
    );

    expect(data.projects.some((p) => p.id === pId)).toBe(true);
    expect(data.isAdmin).toBe(false);
  });

  it("FR-09 c5: Admin can filter by archived", async () => {
    const admin = await createTestContext("ADMIN");
    const now = new Date();
    const activeId = crypto.randomUUID();
    const archivedId = crypto.randomUUID();

    await admin.ctx.db.batch([
      projectRepository.insertStmt(admin.ctx.db, {
        id: activeId,
        code: `ACT-${Date.now().toString().slice(-4)}`,
        name: "Active In Loader",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: admin.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(admin.ctx.db, {
        id: archivedId,
        code: `ARC-${Date.now().toString().slice(-4)}`,
        name: "Archived In Loader",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: admin.user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
    ]);

    // Default request: active only
    const activeData = await projectsLoader(
      admin.ctx,
      new Request("http://localhost/projects", { headers: { Cookie: admin.cookie } }),
    );
    expect(activeData.isAdmin).toBe(true);
    expect(activeData.filter).toBe("active");
    expect(activeData.projects.some((p) => p.id === activeId)).toBe(true);
    expect(activeData.projects.some((p) => p.id === archivedId)).toBe(false);

    // Archived filter request
    const archivedData = await projectsLoader(
      admin.ctx,
      new Request("http://localhost/projects?filter=archived", { headers: { Cookie: admin.cookie } }),
    );
    expect(archivedData.filter).toBe("archived");
    expect(archivedData.projects.some((p) => p.id === activeId)).toBe(false);
    expect(archivedData.projects.some((p) => p.id === archivedId)).toBe(true);
  });
});
