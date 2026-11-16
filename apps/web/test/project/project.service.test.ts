import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { ForbiddenError, ValidationError } from "@pm/domain";
import { projectService } from "../../app/services/project/project.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createMockContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "ADMIN",
  actorId?: string,
): Promise<RequestContext> {
  const id = actorId ?? crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}-${Date.now()}@example.com`;
  const fullName = `${role} User`;

  await userRepository.insert(db, {
    id,
    email,
    fullName,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  return {
    env,
    db,
    user: {
      id,
      email,
      fullName,
      systemRole: role,
      status: "ACTIVE",
    },
    requestId: "test-request-id",
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

describe("projectService", () => {
  describe("FR-07: Create Project", () => {
    it("FR-07 c1: creates project with status ACTIVE, creator as project PM, and audits PROJECT_CREATED atomically (A1)", async () => {
      const ctx = await createMockContext("PM");
      const creatorId = ctx.user?.id ?? "";
      const code = `PRJ-${Date.now().toString().slice(-4)}`;

      const project = await projectService.createProject(ctx, {
        code,
        name: "E-Commerce Rebuild",
        description: "Rebuilding web store",
        budget: 50000000,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.code).toBe(code.toUpperCase());
      expect(project.name).toBe("E-Commerce Rebuild");
      expect(project.status).toBe("ACTIVE");
      expect(project.createdById).toBe(creatorId);

      // Verify creator is project PM in project_members
      const membership = await projectMemberRepository.findByProjectAndUser(ctx.db, project.id, creatorId);
      expect(membership).toBeDefined();
      expect(membership?.projectRole).toBe("PM");

      // Verify audit log
      const audit = await auditLogRepository.listByEntity(ctx.db, "PROJECT", project.id);
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0]?.action).toBe("PROJECT_CREATED");
      expect(audit[0]?.actorId).toBe(creatorId);
    });

    it("FR-07 c1: allows Admin to create project", async () => {
      const ctx = await createMockContext("ADMIN");
      const adminId = ctx.user?.id ?? "";
      const code = `ADM-${Date.now().toString().slice(-4)}`;

      const project = await projectService.createProject(ctx, {
        code,
        name: "Admin Project",
        startDate: "2026-11-01",
        endDate: "2026-12-01",
      });

      expect(project.status).toBe("ACTIVE");
      const membership = await projectMemberRepository.findByProjectAndUser(ctx.db, project.id, adminId);
      expect(membership?.projectRole).toBe("PM");
    });

    it("FR-07 c2: rejects duplicate code with 400 'Project code is already in use'", async () => {
      const ctx = await createMockContext("PM");
      const code = `DUP-${Date.now().toString().slice(-4)}`;

      await projectService.createProject(ctx, {
        code,
        name: "First Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await expect(
        projectService.createProject(ctx, {
          code: code.toLowerCase(), // testing case-insensitivity
          name: "Second Project",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ValidationError);

      try {
        await projectService.createProject(ctx, {
          code,
          name: "Third Project",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const valErr = err as ValidationError;
        expect(valErr.fieldErrors?.code).toContain("Project code is already in use");
      }
    });

    it("FR-07 c2: rejects code that exists on an archived project", async () => {
      const ctx = await createMockContext("PM");
      const userId = ctx.user?.id ?? "";
      const code = `ARC-${Date.now().toString().slice(-4)}`;
      const now = new Date();

      // Seed archived project directly
      await ctx.db.batch([
        projectRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          code: code.toUpperCase(),
          name: "Archived Project",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          status: "ACTIVE",
          createdById: userId,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        }),
      ]);

      await expect(
        projectService.createProject(ctx, {
          code,
          name: "New Project With Archived Code",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("FR-07 c3: rejects when end date is before start date", async () => {
      const ctx = await createMockContext("PM");
      const code = `DAT-${Date.now().toString().slice(-4)}`;

      await expect(
        projectService.createProject(ctx, {
          code,
          name: "Invalid Dates",
          startDate: "2026-12-31",
          endDate: "2026-11-01",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("FR-07 c4: denies system MEMBER from creating project with 403", async () => {
      const ctx = await createMockContext("MEMBER");
      const code = `MEM-${Date.now().toString().slice(-4)}`;

      await expect(
        projectService.createProject(ctx, {
          code,
          name: "Member Project Attempt",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("FR-07 c4: denies system TEAM_LEAD from creating project with 403", async () => {
      const ctx = await createMockContext("TEAM_LEAD");
      const code = `LEA-${Date.now().toString().slice(-4)}`;

      await expect(
        projectService.createProject(ctx, {
          code,
          name: "Lead Project Attempt",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("listProjects", () => {
    it("Admin sees all active projects; regular member sees only memberships", async () => {
      const adminCtx = await createMockContext("ADMIN");
      const pmCtx = await createMockContext("PM");
      const memberCtx = await createMockContext("MEMBER");

      const code1 = `LST-${Date.now().toString().slice(-4)}1`;
      const code2 = `LST-${Date.now().toString().slice(-4)}2`;

      const p1 = await projectService.createProject(pmCtx, {
        code: code1,
        name: "PM Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      const p2 = await projectService.createProject(adminCtx, {
        code: code2,
        name: "Admin Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      // Admin sees both
      const adminList = await projectService.listProjects(adminCtx);
      expect(adminList.some((p) => p.id === p1.id)).toBe(true);
      expect(adminList.some((p) => p.id === p2.id)).toBe(true);

      // PM sees p1 (where they are member), not p2
      const pmList = await projectService.listProjects(pmCtx);
      expect(pmList.some((p) => p.id === p1.id)).toBe(true);
      expect(pmList.some((p) => p.id === p2.id)).toBe(false);

      // Member sees neither
      const memberList = await projectService.listProjects(memberCtx);
      expect(memberList.some((p) => p.id === p1.id)).toBe(false);
      expect(memberList.some((p) => p.id === p2.id)).toBe(false);
    });
  });
});
