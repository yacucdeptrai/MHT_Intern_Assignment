import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { projectSettingsAction } from "../../app/actions/projectSettingsAction";
import { projectSettingsLoader } from "../../app/loaders/projectSettingsLoader";
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

describe("projectSettingsLoader and projectSettingsAction", () => {
  describe("projectSettingsLoader", () => {
    it("PM loads project settings successfully", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.batch([
        projectRepository.insertStmt(ctx.db, {
          id: projectId,
          code: "SET-PM",
          name: "Settings Loader PM",
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
          projectRole: "PM",
          createdAt: now,
        }),
      ]);

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        headers: { Cookie: cookie },
      });

      const res = await projectSettingsLoader(ctx, req, projectId);
      expect(res.project.id).toBe(projectId);
      expect(res.project.name).toBe("Settings Loader PM");
      expect(res.permissions.canManageProject).toBe(true);
    });

    it("FR-08 c3: non-PM member receives 403 Response", async () => {
      const pm = await createTestContext("PM");
      const member = await createTestContext("MEMBER");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await pm.ctx.db.batch([
        projectRepository.insertStmt(pm.ctx.db, {
          id: projectId,
          code: "SET-MEM",
          name: "Member Blocked",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          status: "ACTIVE",
          createdById: pm.user.id,
          createdAt: now,
          updatedAt: now,
        }),
        projectMemberRepository.insertStmt(pm.ctx.db, {
          projectId,
          userId: pm.user.id,
          projectRole: "PM",
          createdAt: now,
        }),
        projectMemberRepository.insertStmt(pm.ctx.db, {
          projectId,
          userId: member.user.id,
          projectRole: "MEMBER",
          createdAt: now,
        }),
      ]);

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        headers: { Cookie: member.cookie },
      });

      await expect(projectSettingsLoader(member.ctx, req, projectId)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("non-member receives 404 Response", async () => {
      const pm = await createTestContext("PM");
      const nonMember = await createTestContext("MEMBER");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await pm.ctx.db.batch([
        projectRepository.insertStmt(pm.ctx.db, {
          id: projectId,
          code: "SET-NON",
          name: "Non-member Blocked",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          status: "ACTIVE",
          createdById: pm.user.id,
          createdAt: now,
          updatedAt: now,
        }),
        projectMemberRepository.insertStmt(pm.ctx.db, {
          projectId,
          userId: pm.user.id,
          projectRole: "PM",
          createdAt: now,
        }),
      ]);

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        headers: { Cookie: nonMember.cookie },
      });

      await expect(projectSettingsLoader(nonMember.ctx, req, projectId)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe("projectSettingsAction", () => {
    it("FR-08 c1 & c2: updates project and ignores code in input", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.batch([
        projectRepository.insertStmt(ctx.db, {
          id: projectId,
          code: "SET-ACT",
          name: "Before Update",
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
          projectRole: "PM",
          createdAt: now,
        }),
      ]);

      const formData = new FormData();
      formData.append("intent", "update");
      formData.append("code", "ATTEMPT_CHANGE");
      formData.append("name", "After Update");
      formData.append("status", "ON_HOLD");
      formData.append("budget", "35000000");

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await projectSettingsAction(ctx, req, projectId);
      expect(res.status).toBe(200);
      const json = await res.json<{ success: boolean; project: { name: string; code: string; status: string } }>();
      expect(json.success).toBe(true);
      expect(json.project.name).toBe("After Update");
      expect(json.project.code).toBe("SET-ACT");
      expect(json.project.status).toBe("ON_HOLD");

      const dbProject = await projectRepository.findById(ctx.db, projectId);
      expect(dbProject?.name).toBe("After Update");
      expect(dbProject?.code).toBe("SET-ACT");
    });

    it("FR-08 c4: returns 400 and keeps input when dates are invalid", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.batch([
        projectRepository.insertStmt(ctx.db, {
          id: projectId,
          code: "SET-DTE",
          name: "Date Check",
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
          projectRole: "PM",
          createdAt: now,
        }),
      ]);

      const formData = new FormData();
      formData.append("intent", "update");
      formData.append("startDate", "2026-12-31");
      formData.append("endDate", "2026-11-01");

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await projectSettingsAction(ctx, req, projectId);
      expect(res.status).toBe(400);
      const json = await res.json<{
        success: boolean;
        errors: Record<string, string[]>;
        values: Record<string, string>;
      }>();
      expect(json.success).toBe(false);
      expect(json.errors.endDate).toBeDefined();
      expect(json.values.startDate).toBe("2026-12-31");
    });

    it("FR-09 c1: PM archives project and redirects to /projects", async () => {
      const { ctx, cookie, user } = await createTestContext("PM");
      const projectId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.batch([
        projectRepository.insertStmt(ctx.db, {
          id: projectId,
          code: "SET-ARC",
          name: "To Archive Via Action",
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
          projectRole: "PM",
          createdAt: now,
        }),
      ]);

      const formData = new FormData();
      formData.append("intent", "archive");

      const req = new Request(`http://localhost/projects/${projectId}/settings`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await projectSettingsAction(ctx, req, projectId);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/projects");

      const dbProject = await projectRepository.findById(ctx.db, projectId);
      expect(dbProject).toBeNull();
    });

    it("returns 400 when intent is invalid or missing", async () => {
      const { ctx, cookie } = await createTestContext("PM");
      const formData = new FormData();
      formData.append("intent", "unknown_intent");

      const req = new Request("http://localhost/projects/any-id/settings", {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await projectSettingsAction(ctx, req, "any-id");
      expect(res.status).toBe(400);
    });
  });
});
