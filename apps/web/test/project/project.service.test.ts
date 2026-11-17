import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@pm/domain";
import { projectService } from "../../app/services/project/project.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createMockContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "ADMIN",
  actorId?: string,
): Promise<RequestContext> {
  const id = actorId ?? crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `${role.toLowerCase()}-${id}-${Date.now()}@example.com`;
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

      // Verify membership: creator is PM
      const membership = await projectMemberRepository.findByProjectAndUser(ctx.db, project.id, creatorId);
      expect(membership).toBeDefined();
      expect(membership?.projectRole).toBe("PM");

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(ctx.db, "PROJECT", project.id);
      expect(logs.length).toBe(1);
      const [log] = logs;
      expect(log).toBeDefined();
      if (!log) {
        throw new Error("Audit log not found");
      }
      expect(log.action).toBe("PROJECT_CREATED");
      expect(log.actorId).toBe(creatorId);
      expect(log.entityType).toBe("PROJECT");
      expect(log.entityId).toBe(project.id);
      expect(log.changes).toMatchObject({
        code: { from: null, to: code.toUpperCase() },
        name: { from: null, to: "E-Commerce Rebuild" },
      });
    });

    it("FR-07 c1: uppercase normalization for project code", async () => {
      const ctx = await createMockContext("PM");
      const code = `mix${Date.now().toString().slice(-4)}`;

      const project = await projectService.createProject(ctx, {
        code,
        name: "Normalized Code Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      expect(project.code).toBe(code.toUpperCase());

      const found = await projectRepository.findByCode(ctx.db, code.toLowerCase());
      expect(found).toBeDefined();
      expect(found?.id).toBe(project.id);
    });

    it("FR-07 c2: duplicate code returns 400 with retained input values", async () => {
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
          code,
          name: "Second Project Duplicate Code",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ValidationError);

      try {
        await projectService.createProject(ctx, {
          code,
          name: "Second Project Duplicate Code",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const vErr = err as ValidationError;
        expect(vErr.message).toBe("Project code is already in use");
        expect(vErr.fieldErrors?.code).toContain("Project code is already in use");
      }
    });

    it("FR-07 c3: rejects endDate before startDate with 400", async () => {
      const ctx = await createMockContext("PM");
      const code = `DTE-${Date.now().toString().slice(-4)}`;

      await expect(
        projectService.createProject(ctx, {
          code,
          name: "Invalid Date Range",
          startDate: "2026-12-01",
          endDate: "2026-11-01",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("FR-07 c4: non-PM non-admin user cannot create project (403)", async () => {
      const memberCtx = await createMockContext("MEMBER");
      const code = `MBR-${Date.now().toString().slice(-4)}`;

      await expect(
        projectService.createProject(memberCtx, {
          code,
          name: "Member Project Attempt",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ForbiddenError);

      const leadCtx = await createMockContext("TEAM_LEAD");
      await expect(
        projectService.createProject(leadCtx, {
          code: `LD-${code}`,
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

  describe("getProjectHeader (M2-T2, FR-08)", () => {
    it("returns project header and permissions for project member", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `HDR-${Date.now().toString().slice(-4)}`;

      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Header Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      const res = await projectService.getProjectHeader(pmCtx, created.id);
      expect(res.project).toMatchObject({
        id: created.id,
        code: code.toUpperCase(),
        name: "Header Project",
        status: "ACTIVE",
        projectRole: "PM",
        isArchived: false,
      });
      expect(res.permissions).toEqual({
        canManageProject: true,
        canManageMembers: true,
        canManageSprint: true,
        canViewMemberReport: true,
        canViewProjectReport: true,
        canExportProject: true,
      });
    });

    it("returns project header and permissions for Admin across any project", async () => {
      const pmCtx = await createMockContext("PM");
      const adminCtx = await createMockContext("ADMIN");
      const code = `ADM-${Date.now().toString().slice(-4)}`;

      const created = await projectService.createProject(pmCtx, {
        code,
        name: "PM Project For Admin",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      const res = await projectService.getProjectHeader(adminCtx, created.id);
      expect(res.project).toMatchObject({
        id: created.id,
        code: code.toUpperCase(),
        name: "PM Project For Admin",
        status: "ACTIVE",
        projectRole: "PM",
        isArchived: false,
      });
      expect(res.permissions.canManageProject).toBe(true);
      expect(res.permissions.canManageMembers).toBe(true);
    });

    it("throws NotFoundError (404) for non-member on active project", async () => {
      const pmCtx = await createMockContext("PM");
      const nonMemberCtx = await createMockContext("MEMBER");
      const code = `NON-${Date.now().toString().slice(-4)}`;

      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Secret Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await expect(projectService.getProjectHeader(nonMemberCtx, created.id)).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError (404) for non-existent project", async () => {
      const adminCtx = await createMockContext("ADMIN");
      await expect(projectService.getProjectHeader(adminCtx, "non-existent-id")).rejects.toThrow(NotFoundError);
    });
  });

  describe("FR-08: Update Project", () => {
    it("FR-08 c1: PM updates project fields and audits PROJECT_UPDATED atomically (A2)", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `U${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Initial Project Name",
        description: "Initial description",
        budget: 10000000,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      const updated = await projectService.updateProject(pmCtx, created.id, {
        name: "Renamed Project",
        description: "Updated description",
        status: "ON_HOLD",
        budget: 15000000,
      });

      expect(updated.name).toBe("Renamed Project");
      expect(updated.description).toBe("Updated description");
      expect(updated.status).toBe("ON_HOLD");
      expect(updated.budget).toBe(15000000);

      // Verify DB record
      const dbProject = await projectRepository.findById(pmCtx.db, created.id);
      expect(dbProject?.name).toBe("Renamed Project");
      expect(dbProject?.status).toBe("ON_HOLD");

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(pmCtx.db, "PROJECT", created.id);
      const updateLog = logs.find((l) => l.action === "PROJECT_UPDATED");
      expect(updateLog).toBeDefined();
      expect(updateLog?.changes).toMatchObject({
        name: { from: "Initial Project Name", to: "Renamed Project" },
        status: { from: "ACTIVE", to: "ON_HOLD" },
        budget: { from: 10000000, to: 15000000 },
      });
    });

    it("FR-08 c2: ignores code if provided in input and code is unchanged", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `U${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Original Name",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      // Pass code in input (which should be stripped by schema / not updated)
      const updated = await projectService.updateProject(pmCtx, created.id, {
        name: "New Name",
        // @ts-expect-error - testing client posting code
        code: "HACKED_CODE",
      });

      expect(updated.code).toBe(code.toUpperCase());
      const dbProject = await projectRepository.findById(pmCtx.db, created.id);
      expect(dbProject?.code).toBe(code.toUpperCase());
    });

    it("FR-08 c3: non-PM member receives 403 Forbidden", async () => {
      const pmCtx = await createMockContext("PM");
      const memberCtx = await createMockContext("MEMBER");
      const code = `U${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "PM Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      // Add user as regular member
      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId: created.id,
          userId: memberCtx.user?.id ?? "",
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      await expect(
        projectService.updateProject(memberCtx, created.id, {
          name: "Attempted Member Edit",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("FR-08: non-member receives 404 NotFound", async () => {
      const pmCtx = await createMockContext("PM");
      const nonMemberCtx = await createMockContext("MEMBER");
      const code = `U${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Private Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await expect(
        projectService.updateProject(nonMemberCtx, created.id, {
          name: "Non-member edit",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("FR-08 c4: rejects when updated endDate is before existing startDate", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `U${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Dated Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await expect(
        projectService.updateProject(pmCtx, created.id, {
          endDate: "2026-10-01",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("FR-09: Archive Project", () => {
    it("FR-09 c1: PM archives project, hides it from active list, and audits PROJECT_ARCHIVED atomically (A3)", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `A${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "To Be Archived",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await projectService.archiveProject(pmCtx, created.id);

      // Verify active list does not include it
      const activeProjects = await projectService.listProjects(pmCtx);
      expect(activeProjects.some((p) => p.id === created.id)).toBe(false);

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(pmCtx.db, "PROJECT", created.id);
      const archiveLog = logs.find((l) => l.action === "PROJECT_ARCHIVED");
      expect(archiveLog).toBeDefined();
    });

    it("FR-09 c2: former member receives 404 NotFound on archived project URL", async () => {
      const pmCtx = await createMockContext("PM");
      const memberCtx = await createMockContext("MEMBER");
      const code = `A${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Archived For Member",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId: created.id,
          userId: memberCtx.user?.id ?? "",
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      await projectService.archiveProject(pmCtx, created.id);

      await expect(projectService.getProjectHeader(memberCtx, created.id)).rejects.toThrow(NotFoundError);
    });

    it("FR-09 c2: Admin can view archived project via archivedOnly filter", async () => {
      const pmCtx = await createMockContext("PM");
      const adminCtx = await createMockContext("ADMIN");
      const code = `A${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Archived Admin View",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await projectService.archiveProject(pmCtx, created.id);

      // Admin header load succeeds
      const header = await projectService.getProjectHeader(adminCtx, created.id);
      expect(header.project.isArchived).toBe(true);

      // Admin archived list includes it
      const archivedProjects = await projectService.listProjects(adminCtx, { archivedOnly: true });
      expect(archivedProjects.some((p) => p.id === created.id)).toBe(true);

      // Non-admin archived list returns empty
      const memberArchived = await projectService.listProjects(pmCtx, { archivedOnly: true });
      expect(memberArchived.some((p) => p.id === created.id)).toBe(false);
    });

    it("FR-09 c3: non-PM member receives 403 Forbidden when attempting to archive", async () => {
      const pmCtx = await createMockContext("PM");
      const leadCtx = await createMockContext("TEAM_LEAD");
      const code = `A${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Lead Cannot Archive",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId: created.id,
          userId: leadCtx.user?.id ?? "",
          projectRole: "TEAM_LEAD",
          createdAt: new Date(),
        }),
      ]);

      await expect(projectService.archiveProject(leadCtx, created.id)).rejects.toThrow(ForbiddenError);
    });

    it("FR-09 c4: Admin receives 403 Forbidden ('This project is archived') when updating an archived project", async () => {
      const pmCtx = await createMockContext("PM");
      const adminCtx = await createMockContext("ADMIN");
      const code = `A${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Archived Read-Only",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await projectService.archiveProject(pmCtx, created.id);

      await expect(
        projectService.updateProject(adminCtx, created.id, {
          name: "Attempt Admin Update on Archived",
        }),
      ).rejects.toThrow("This project is archived");
    });
  });

  describe("getProjectSettings", () => {
    it("returns project settings for project PM", async () => {
      const pmCtx = await createMockContext("PM");
      const code = `S${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Settings Project",
        description: "For settings test",
        budget: 50000,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        slackChannelId: "C123456",
      });

      const res = await projectService.getProjectSettings(pmCtx, created.id);
      expect(res.project).toMatchObject({
        id: created.id,
        code: code.toUpperCase(),
        name: "Settings Project",
        description: "For settings test",
        budget: 50000,
        slackChannelId: "C123456",
        isArchived: false,
      });
      expect(res.permissions.canManageProject).toBe(true);
    });

    it("throws ForbiddenError (403) for non-PM member", async () => {
      const pmCtx = await createMockContext("PM");
      const memberCtx = await createMockContext("MEMBER");
      const code = `S${Date.now().toString().slice(-6)}`;
      const created = await projectService.createProject(pmCtx, {
        code,
        name: "Member Blocked Settings",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
      });

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId: created.id,
          userId: memberCtx.user?.id ?? "",
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      await expect(projectService.getProjectSettings(memberCtx, created.id)).rejects.toThrow(ForbiddenError);
    });
  });
});
