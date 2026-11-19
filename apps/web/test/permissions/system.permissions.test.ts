import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, userRepository, type AppDatabase } from "@pm/db";
import { ForbiddenError, ValidationError, type SystemRole } from "@pm/domain";

import { auditLogService } from "../../app/services/auditLog.service";
import { projectService } from "../../app/services/project/project.service";
import { projectMemberService } from "../../app/services/project/projectMember.service";
import { taskService } from "../../app/services/task.service";
import { taskStatusService } from "../../app/services/taskStatus.service";
import { userService } from "../../app/services/user/user.service";
import { makeRequestContext, setupPermissionFixture, type PermissionFixture, type TestUserEntity } from "./helpers";

describe("System Permission Matrix & Invariants (docs/05 §3.1 & §3.2)", () => {
  let db: AppDatabase;
  let admin: TestUserEntity;
  let sysPm: TestUserEntity;
  let sysLead: TestUserEntity;
  let sysMember: TestUserEntity;
  let fixture: PermissionFixture;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    const now = new Date();

    const createSysUser = async (role: SystemRole, tag: string): Promise<TestUserEntity> => {
      const id = crypto.randomUUID();
      const user = await userRepository.insert(db, {
        id,
        email: `sys-${tag}-${id.slice(0, 8)}@example.com`,
        fullName: `System ${tag}`,
        systemRole: role,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        systemRole: user.systemRole,
      };
    };

    admin = await createSysUser("ADMIN", "admin");
    sysPm = await createSysUser("PM", "pm");
    sysLead = await createSysUser("TEAM_LEAD", "lead");
    sysMember = await createSysUser("MEMBER", "member");

    fixture = await setupPermissionFixture();
  });

  describe("manageUsers (FR-03, FR-04)", () => {
    it("ADMIN can create user", async () => {
      const res = await userService.createUser(makeRequestContext(db, admin), {
        email: `new-${crypto.randomUUID().slice(0, 8)}@example.com`,
        fullName: "New User",
        systemRole: "MEMBER",
      });
      expect(res.user.id).toBeDefined();
    });

    it("PM cannot manage users (403)", async () => {
      await expect(
        userService.createUser(makeRequestContext(db, sysPm), {
          email: `fail-${crypto.randomUUID().slice(0, 8)}@example.com`,
          fullName: "Fail User",
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("TEAM_LEAD cannot manage users (403)", async () => {
      await expect(
        userService.createUser(makeRequestContext(db, sysLead), {
          email: `fail-${crypto.randomUUID().slice(0, 8)}@example.com`,
          fullName: "Fail User",
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("MEMBER cannot manage users (403)", async () => {
      await expect(
        userService.createUser(makeRequestContext(db, sysMember), {
          email: `fail-${crypto.randomUUID().slice(0, 8)}@example.com`,
          fullName: "Fail User",
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("manageStatuses (FR-20)", () => {
    it("ADMIN can create status", async () => {
      const res = await taskStatusService.createStatus(makeRequestContext(db, admin), {
        name: `Status ${crypto.randomUUID().slice(0, 6)}`,
        category: "IN_PROGRESS",
      });
      expect(res.id).toBeDefined();
    });

    it("PM cannot manage statuses (403)", async () => {
      await expect(
        taskStatusService.createStatus(makeRequestContext(db, sysPm), {
          name: "Custom Status",
          category: "IN_PROGRESS",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("TEAM_LEAD cannot manage statuses (403)", async () => {
      await expect(
        taskStatusService.createStatus(makeRequestContext(db, sysLead), {
          name: "Custom Status",
          category: "IN_PROGRESS",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("MEMBER cannot manage statuses (403)", async () => {
      await expect(
        taskStatusService.createStatus(makeRequestContext(db, sysMember), {
          name: "Custom Status",
          category: "IN_PROGRESS",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("viewAuditLog (FR-24)", () => {
    it("ADMIN can view system audit log", async () => {
      const res = await auditLogService.listSystemAuditLogs(makeRequestContext(db, admin), {});
      expect(res.entries).toBeDefined();
    });

    it("PM cannot view system audit log (403)", async () => {
      await expect(auditLogService.listSystemAuditLogs(makeRequestContext(db, sysPm), {})).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("TEAM_LEAD cannot view system audit log (403)", async () => {
      await expect(auditLogService.listSystemAuditLogs(makeRequestContext(db, sysLead), {})).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("MEMBER cannot view system audit log (403)", async () => {
      await expect(auditLogService.listSystemAuditLogs(makeRequestContext(db, sysMember), {})).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe("createProject (FR-07)", () => {
    it("ADMIN can create project", async () => {
      const code = `ADM${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const project = await projectService.createProject(makeRequestContext(db, admin), {
        code,
        name: "Admin Created Project",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(project.id).toBeDefined();
    });

    it("PM can create project", async () => {
      const code = `PM${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const project = await projectService.createProject(makeRequestContext(db, sysPm), {
        code,
        name: "PM Created Project",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(project.id).toBeDefined();
    });

    it("TEAM_LEAD cannot create project (403)", async () => {
      const code = `TL${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await expect(
        projectService.createProject(makeRequestContext(db, sysLead), {
          code,
          name: "Lead Created Project",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("MEMBER cannot create project (403)", async () => {
      const code = `MB${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await expect(
        projectService.createProject(makeRequestContext(db, sysMember), {
          code,
          name: "Member Created Project",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Invariants (docs/05 §3.2 & §5)", () => {
    it("No self-lockout: Admin cannot lock, delete, or demote themselves (throws 400)", async () => {
      const adminCtx = makeRequestContext(db, admin);

      // Lock self
      await expect(userService.lockUser(adminCtx, admin.id)).rejects.toThrow(ValidationError);

      // Delete self
      await expect(userService.deleteUser(adminCtx, admin.id)).rejects.toThrow(ValidationError);

      // Demote self
      await expect(
        userService.updateUser(adminCtx, {
          userId: admin.id,
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("Last Admin: demoting, locking, or deleting the only ADMIN is blocked with 400", async () => {
      // Soft-delete all other active admins in DB so `admin` is the ONLY admin
      const allAdmins = await db.query.users.findMany({
        where: (u, { and, eq, isNull }) => and(eq(u.systemRole, "ADMIN"), isNull(u.deletedAt)),
      });
      const now = new Date();
      for (const a of allAdmins) {
        if (a.id !== admin.id) {
          await userRepository.softDeleteStmt(db, a.id, now);
        }
      }

      const count = await userRepository.countAdmins(db);
      expect(count).toBe(1);

      // Caller acting as an admin from session/token on the only remaining admin
      const anotherAdminCtx = makeRequestContext(db, {
        id: crypto.randomUUID(),
        email: "caller-admin@example.com",
        fullName: "Caller Admin",
        systemRole: "ADMIN",
      });

      // Attempt to demote the only admin
      await expect(
        userService.updateUser(anotherAdminCtx, {
          userId: admin.id,
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(/At least one administrator is required/i);

      // Attempt to lock the only admin
      await expect(userService.lockUser(anotherAdminCtx, admin.id)).rejects.toThrow(
        /At least one administrator is required/i,
      );

      // Attempt to delete the only admin
      await expect(userService.deleteUser(anotherAdminCtx, admin.id)).rejects.toThrow(
        /At least one administrator is required/i,
      );
    });

    it("Last project PM: removing or demoting the only PM in a project is blocked with 400", async () => {
      // In fixture, projectPm is the only PM in fixture.projectId
      const pmCtx = fixture.makeCtx("projectPm");

      // Attempt to remove the only PM
      await expect(
        projectMemberService.removeMember(pmCtx, fixture.projectId, {
          userId: fixture.actors.projectPm.id,
        }),
      ).rejects.toThrow(/A project needs at least one PM/i);

      // Attempt to demote the only PM
      await expect(
        projectMemberService.changeRole(pmCtx, fixture.projectId, {
          userId: fixture.actors.projectPm.id,
          projectRole: "MEMBER",
        }),
      ).rejects.toThrow(/A project needs at least one PM/i);
    });

    it("Non-member assignment: assigning a task to a non-member is blocked with 400", async () => {
      const pmCtx = fixture.makeCtx("projectPm");
      const task = await fixture.createTestTask();

      // Assign nonMember via assignTask
      await expect(
        taskService.assignTask(pmCtx, fixture.projectId, task.id, {
          assigneeIds: [fixture.actors.nonMember.id],
          version: task.version,
        }),
      ).rejects.toThrow(/Assignees must be project members/i);

      // Create task with nonMember assignee
      await expect(
        taskService.createTask(pmCtx, fixture.projectId, {
          title: "Task with non-member assignee",
          assigneeIds: [fixture.actors.nonMember.id],
        }),
      ).rejects.toThrow(/Assignees must be project members/i);
    });
  });
});
