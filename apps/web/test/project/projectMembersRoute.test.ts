import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { projectMembersAction } from "../../app/actions/projectMembersAction";
import { projectMembersLoader } from "../../app/loaders/projectMembersLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
): Promise<{ ctx: RequestContext; cookie: string; user: { id: string; fullName: string; email: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}-${Date.now()}@example.com`;

  const user = await userRepository.insert(db, {
    id,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const secret = env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long";
  const session = await getSession(new Request("http://localhost"), secret);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret });

  const ctx: RequestContext = {
    env: {
      ...env,
      SESSION_SECRET: secret,
      APP_BASE_URL: env.APP_BASE_URL || "http://localhost:3000",
    },
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

async function createProjectWithPM(ctx: RequestContext, pmId: string) {
  const projectId = crypto.randomUUID();
  const now = new Date();
  const code = `P${Date.now().toString().slice(-6)}`;

  await ctx.db.batch([
    projectRepository.insertStmt(ctx.db, {
      id: projectId,
      code,
      name: "Route Test Project",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: pmId,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(ctx.db, {
      projectId,
      userId: pmId,
      projectRole: "PM",
      createdAt: now,
    }),
  ]);

  return { projectId, code };
}

describe("projectMembersLoader and projectMembersAction", () => {
  describe("projectMembersLoader", () => {
    it("loads project members and permissions for PM", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(ctx, user.id);

      const request = new Request(`http://localhost/projects/${projectId}/members`, {
        headers: { Cookie: cookie },
      });

      const res = await projectMembersLoader(ctx, request, projectId);
      expect(res.members).toHaveLength(1);
      expect(res.members[0]?.userId).toBe(user.id);
      expect(res.permissions.canManageMembers).toBe(true);
    });

    it("returns searchResults when ?q= parameter is provided", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(ctx, user.id);

      const candidate = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: `candidate-${Date.now()}@example.com`,
        fullName: "Searchable Candidate",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request(`http://localhost/projects/${projectId}/members?q=Searchable`, {
        headers: { Cookie: cookie },
      });

      const res = await projectMembersLoader(ctx, request, projectId);
      expect(res.searchResults).toBeDefined();
      expect(res.searchResults?.some((c) => c.id === candidate.id)).toBe(true);
    });

    it("returns 404 for non-members", async () => {
      const pm = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(pm.ctx, pm.user.id);

      const nonMember = await createTestContext("MEMBER");
      const request = new Request(`http://localhost/projects/${projectId}/members`, {
        headers: { Cookie: nonMember.cookie },
      });

      await expect(projectMembersLoader(nonMember.ctx, request, projectId)).rejects.toThrow();
    });
  });

  describe("projectMembersAction", () => {
    it("adds member, rejects duplicate, and allows removing member", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(ctx, user.id);

      const targetUser = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: `target-${Date.now()}@example.com`,
        fullName: "Target User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 1. Add member
      const addForm = new FormData();
      addForm.append("intent", "add");
      addForm.append("userId", targetUser.id);
      addForm.append("projectRole", "MEMBER");

      const addReq = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: addForm,
      });

      const addRes = await projectMembersAction(ctx, addReq, projectId);
      expect(addRes.status).toBe(200);
      const addData = await addRes.json<{ success: boolean }>();
      expect(addData.success).toBe(true);

      // 2. Reject duplicate add
      const dupReq = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: addForm,
      });
      const dupRes = await projectMembersAction(ctx, dupReq, projectId);
      expect(dupRes.status).toBe(400);

      // 3. Remove member
      const removeForm = new FormData();
      removeForm.append("intent", "remove");
      removeForm.append("userId", targetUser.id);

      const removeReq = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: removeForm,
      });
      const removeRes = await projectMembersAction(ctx, removeReq, projectId);
      expect(removeRes.status).toBe(200);
      const removeData = await removeRes.json<{ success: boolean }>();
      expect(removeData.success).toBe(true);
    });

    it("creates invite and returns inviteUrl", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(ctx, user.id);

      const inviteForm = new FormData();
      inviteForm.append("intent", "invite");
      inviteForm.append("email", `invite-route-${Date.now()}@example.com`);
      inviteForm.append("projectRole", "TEAM_LEAD");

      const inviteReq = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: inviteForm,
      });

      const inviteRes = await projectMembersAction(ctx, inviteReq, projectId);
      expect(inviteRes.status).toBe(200);
      const inviteData = await inviteRes.json<{ success: boolean; inviteUrl: string }>();
      expect(inviteData.success).toBe(true);
      expect(inviteData.inviteUrl).toContain("/invite/");
    });

    it("rejects removing the last PM with 400", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(ctx, user.id);

      const removeForm = new FormData();
      removeForm.append("intent", "remove");
      removeForm.append("userId", user.id);

      const removeReq = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: removeForm,
      });

      const removeRes = await projectMembersAction(ctx, removeReq, projectId);
      expect(removeRes.status).toBe(400);
      const data = await removeRes.json<{ message: string }>();
      expect(data.message).toBe("A project needs at least one PM");
    });

    it("rejects non-PM/Admin member modification with 403", async () => {
      const pm = await createTestContext("PM");
      const { projectId } = await createProjectWithPM(pm.ctx, pm.user.id);

      const member = await createTestContext("MEMBER");
      await projectMemberRepository.insertStmt(pm.ctx.db, {
        projectId,
        userId: member.user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      });

      const addForm = new FormData();
      addForm.append("intent", "add");
      addForm.append("userId", crypto.randomUUID());
      addForm.append("projectRole", "MEMBER");

      const req = new Request(`http://localhost/projects/${projectId}/members`, {
        method: "POST",
        headers: { Cookie: member.cookie },
        body: addForm,
      });

      const res = await projectMembersAction(member.ctx, req, projectId);
      expect(res.status).toBe(403);
    });
  });
});
