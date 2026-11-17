import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import {
  auditLogRepository,
  createDatabase,
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  userRepository,
} from "@pm/db";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@pm/domain";
import { projectMemberService } from "../../app/services/project/projectMember.service";
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
    env: {
      ...env,
      SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
      APP_BASE_URL: "http://localhost:3000",
    },
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

async function createTestProject(ctx: RequestContext, pmId: string) {
  const projectId = crypto.randomUUID();
  const now = ctx.clock.now();
  const code = `P${Date.now().toString().slice(-6)}`;

  await ctx.db.batch([
    projectRepository.insertStmt(ctx.db, {
      id: projectId,
      code,
      name: "Members Test Project",
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

describe("projectMemberService (FR-10)", () => {
  it("FR-10 c1: searches active non-members correctly", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    // Active candidate
    const candidate = await userRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      email: `search-candidate-${Date.now()}@example.com`,
      fullName: "Bob Searchable",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: pmCtx.clock.now(),
      updatedAt: pmCtx.clock.now(),
    });

    // Inactive candidate
    await userRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      email: `search-inactive-${Date.now()}@example.com`,
      fullName: "Inactive Person",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: pmCtx.clock.now(),
      updatedAt: pmCtx.clock.now(),
    });

    const results = await projectMemberService.searchUsers(pmCtx, projectId, { q: "Bob" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(candidate.id);

    // Searching PM (already a member) returns nothing
    const pmSearch = await projectMemberService.searchUsers(pmCtx, projectId, { q: pmCtx.user?.fullName ?? "" });
    expect(pmSearch).toHaveLength(0);
  });

  it("FR-10 c2: adds member, writes MEMBER_ADDED audit and PROJECT_MEMBER_ADDED notification atomically", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const newMemberUser = await userRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      email: `add-member-${Date.now()}@example.com`,
      fullName: "Alice Member",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: pmCtx.clock.now(),
      updatedAt: pmCtx.clock.now(),
    });

    const res = await projectMemberService.addMember(pmCtx, projectId, {
      userId: newMemberUser.id,
      projectRole: "MEMBER",
    });
    expect(res.success).toBe(true);

    // Check membership
    const member = await projectMemberRepository.findByProjectAndUser(pmCtx.db, projectId, newMemberUser.id);
    expect(member).toBeDefined();
    expect(member?.projectRole).toBe("MEMBER");

    // Check audit log
    const auditLogs = await auditLogRepository.listByProject(pmCtx.db, projectId);
    const addedAudit = auditLogs.find((a) => a.action === "MEMBER_ADDED");
    expect(addedAudit).toBeDefined();
    expect(addedAudit?.actorId).toBe(pmId);
    expect(addedAudit?.changes).toEqual({
      userId: { from: null, to: newMemberUser.id },
      projectRole: { from: null, to: "MEMBER" },
    });

    // Check notification
    const notifications = await notificationRepository.listByUser(pmCtx.db, newMemberUser.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe("PROJECT_MEMBER_ADDED");
    expect(notifications[0]?.projectId).toBe(projectId);
    expect(notifications[0]?.payload.actorName).toBe(pmCtx.user?.fullName ?? "");
  });

  it("FR-10 c2: rejects duplicate member with 400 Already a member", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    // Try to add PM again
    await expect(
      projectMemberService.addMember(pmCtx, projectId, {
        userId: pmId,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      projectMemberService.addMember(pmCtx, projectId, {
        userId: pmId,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow("Already a member");
  });

  it("FR-10 c3: creates project invite carrying project and role", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const inviteEmail = `invite-${Date.now()}@example.com`;
    const res = await projectMemberService.inviteMember(pmCtx, projectId, {
      email: inviteEmail,
      projectRole: "TEAM_LEAD",
    });

    expect(res.inviteUrl).toContain("/invite/");

    const { pendingInvites } = await projectMemberService.getProjectMembers(pmCtx, projectId);
    const found = pendingInvites.find((i) => i.email === inviteEmail);
    expect(found).toBeDefined();
    expect(found?.projectRole).toBe("TEAM_LEAD");
  });

  it("FR-10 c3: rejects project invite if user is already a member", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const pmEmail = pmCtx.user?.email ?? "";
    await expect(
      projectMemberService.inviteMember(pmCtx, projectId, {
        email: pmEmail,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      projectMemberService.inviteMember(pmCtx, projectId, {
        email: pmEmail,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow("User is already a member of this project");
  });

  it("FR-10 c4: removes the member and audits MEMBER_REMOVED", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const targetUser = await userRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      email: `remove-me-${Date.now()}@example.com`,
      fullName: "Remove Me",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: pmCtx.clock.now(),
      updatedAt: pmCtx.clock.now(),
    });

    await projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: targetUser.id,
      projectRole: "MEMBER",
      createdAt: pmCtx.clock.now(),
    });

    const res = await projectMemberService.removeMember(pmCtx, projectId, { userId: targetUser.id });
    expect(res.success).toBe(true);

    const membership = await projectMemberRepository.findByProjectAndUser(pmCtx.db, projectId, targetUser.id);
    expect(membership).toBeNull();

    const auditLogs = await auditLogRepository.listByProject(pmCtx.db, projectId);
    const removedAudit = auditLogs.find((a) => a.action === "MEMBER_REMOVED");
    expect(removedAudit).toBeDefined();
    expect(removedAudit?.actorId).toBe(pmId);
    expect(removedAudit?.changes).toEqual({
      userId: { from: targetUser.id, to: null },
      projectRole: { from: "MEMBER", to: null },
    });
  });

  it.todo("FR-10 c4: removes the member's assignments on unarchived tasks in the same batch");

  it("FR-10 c5: rejects removing the last PM with 400 A project needs at least one PM", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    // Only 1 PM currently (pmId)
    await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: pmId })).rejects.toThrow(
      ValidationError,
    );

    await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: pmId })).rejects.toThrow(
      "A project needs at least one PM",
    );
  });

  it("FR-10 c6: rejects TEAM_LEAD and MEMBER member modifications with 403", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const leadCtx = await createMockContext("TEAM_LEAD");
    const leadId = leadCtx.user?.id ?? "";
    await projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: leadId,
      projectRole: "TEAM_LEAD",
      createdAt: pmCtx.clock.now(),
    });

    const memberCtx = await createMockContext("MEMBER");
    const memberId = memberCtx.user?.id ?? "";
    await projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: memberId,
      projectRole: "MEMBER",
      createdAt: pmCtx.clock.now(),
    });

    const candidate = await userRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      email: `candidate-${Date.now()}@example.com`,
      fullName: "Candidate",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: pmCtx.clock.now(),
      updatedAt: pmCtx.clock.now(),
    });

    // TEAM_LEAD cannot add member
    await expect(
      projectMemberService.addMember(leadCtx, projectId, {
        userId: candidate.id,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ForbiddenError);

    // MEMBER cannot add member
    await expect(
      projectMemberService.addMember(memberCtx, projectId, {
        userId: candidate.id,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ForbiddenError);

    // TEAM_LEAD cannot remove member
    await expect(projectMemberService.removeMember(leadCtx, projectId, { userId: memberId })).rejects.toThrow(
      ForbiddenError,
    );

    // MEMBER cannot remove member
    await expect(projectMemberService.removeMember(memberCtx, projectId, { userId: leadId })).rejects.toThrow(
      ForbiddenError,
    );

    // TEAM_LEAD cannot invite member
    await expect(
      projectMemberService.inviteMember(leadCtx, projectId, {
        email: "invitee@example.com",
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ForbiddenError);

    // MEMBER cannot invite member
    await expect(
      projectMemberService.inviteMember(memberCtx, projectId, {
        email: "invitee@example.com",
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("FR-10: non-member receives 404 for project member operations", async () => {
    const pmCtx = await createMockContext("PM");
    const pmId = pmCtx.user?.id ?? "";
    const { projectId } = await createTestProject(pmCtx, pmId);

    const nonMemberCtx = await createMockContext("MEMBER");

    const nonMemberId = nonMemberCtx.user?.id ?? "";

    await expect(projectMemberService.getProjectMembers(nonMemberCtx, projectId)).rejects.toThrow(NotFoundError);
    await expect(
      projectMemberService.addMember(nonMemberCtx, projectId, {
        userId: nonMemberId,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(projectMemberService.removeMember(nonMemberCtx, projectId, { userId: pmId })).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      projectMemberService.inviteMember(nonMemberCtx, projectId, {
        email: "someone@example.com",
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("FR-10: archived project rejects member modifications with 403 This project is archived", async () => {
    const adminCtx = await createMockContext("ADMIN");
    const adminId = adminCtx.user?.id ?? "";
    const { projectId } = await createTestProject(adminCtx, adminId);

    // Archive project
    await projectRepository.archiveStmt(adminCtx.db, projectId, adminCtx.clock.now());

    const candidate = await userRepository.insert(adminCtx.db, {
      id: crypto.randomUUID(),
      email: `candidate-archived-${Date.now()}@example.com`,
      fullName: "Candidate Archived",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: adminCtx.clock.now(),
      updatedAt: adminCtx.clock.now(),
    });

    await expect(
      projectMemberService.addMember(adminCtx, projectId, {
        userId: candidate.id,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      projectMemberService.addMember(adminCtx, projectId, {
        userId: candidate.id,
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow("This project is archived");

    await expect(projectMemberService.removeMember(adminCtx, projectId, { userId: adminId })).rejects.toThrow(
      "This project is archived",
    );

    await expect(
      projectMemberService.inviteMember(adminCtx, projectId, {
        email: "archived-invite@example.com",
        projectRole: "MEMBER",
      }),
    ).rejects.toThrow("This project is archived");
  });

  describe("projectMemberService error handling and edge cases", () => {
    it("throws UnauthorizedError when ctx.user is null", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");
      const unauthCtx = { ...pmCtx, user: null };

      await expect(projectMemberService.searchUsers(unauthCtx, projectId, { q: "" })).rejects.toThrow(
        UnauthorizedError,
      );
      await expect(
        projectMemberService.addMember(unauthCtx, projectId, { userId: crypto.randomUUID(), projectRole: "MEMBER" }),
      ).rejects.toThrow(UnauthorizedError);
      await expect(
        projectMemberService.removeMember(unauthCtx, projectId, { userId: crypto.randomUUID() }),
      ).rejects.toThrow(UnauthorizedError);
      await expect(
        projectMemberService.inviteMember(unauthCtx, projectId, { email: "a@b.com", projectRole: "MEMBER" }),
      ).rejects.toThrow(UnauthorizedError);
      await expect(
        projectMemberService.changeRole(unauthCtx, projectId, {
          userId: crypto.randomUUID(),
          projectRole: "TEAM_LEAD",
        }),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("throws ValidationError on invalid schema inputs", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");

      await expect(
        projectMemberService.addMember(pmCtx, projectId, {
          userId: "",
          // @ts-expect-error invalid role
          projectRole: "INVALID",
        }),
      ).rejects.toThrow(ValidationError);

      await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: "" })).rejects.toThrow(
        ValidationError,
      );

      await expect(
        projectMemberService.inviteMember(pmCtx, projectId, {
          email: "not-an-email",
          projectRole: "MEMBER",
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        projectMemberService.changeRole(pmCtx, projectId, {
          userId: "",
          // @ts-expect-error invalid role
          projectRole: "INVALID",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when adding non-existent or inactive user", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");

      // Non-existent user
      await expect(
        projectMemberService.addMember(pmCtx, projectId, { userId: crypto.randomUUID(), projectRole: "MEMBER" }),
      ).rejects.toThrow("User not found or inactive");

      // Inactive (LOCKED) user
      const lockedUser = await userRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        email: `locked-${Date.now()}@example.com`,
        fullName: "Locked Person",
        systemRole: "MEMBER",
        status: "LOCKED",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(
        projectMemberService.addMember(pmCtx, projectId, { userId: lockedUser.id, projectRole: "MEMBER" }),
      ).rejects.toThrow("User not found or inactive");
    });

    it("throws NotFoundError when target member is not in project for remove or changeRole", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");
      const otherUser = await userRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        email: `other-${Date.now()}@example.com`,
        fullName: "Other Person",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: otherUser.id })).rejects.toThrow(
        "Member not found in project",
      );

      await expect(
        projectMemberService.changeRole(pmCtx, projectId, { userId: otherUser.id, projectRole: "TEAM_LEAD" }),
      ).rejects.toThrow("Member not found in project");
    });

    it("changes member role, rejects demoting last PM, and audits MEMBER_ROLE_CHANGED (A6)", async () => {
      const pmCtx = await createMockContext("PM");
      const pmId = pmCtx.user?.id ?? "";
      const { projectId } = await createTestProject(pmCtx, pmId);

      const target = await userRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        email: `role-target-${Date.now()}@example.com`,
        fullName: "Role Target",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: target.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      });

      // Change role from MEMBER to TEAM_LEAD
      const res = await projectMemberService.changeRole(pmCtx, projectId, {
        userId: target.id,
        projectRole: "TEAM_LEAD",
      });
      expect(res.success).toBe(true);

      const updatedMember = await projectMemberRepository.findByProjectAndUser(pmCtx.db, projectId, target.id);
      expect(updatedMember?.projectRole).toBe("TEAM_LEAD");

      // Verify audit log
      const logs = await auditLogRepository.listByProject(pmCtx.db, projectId);
      const roleLog = logs.find((l) => l.action === "MEMBER_ROLE_CHANGED");
      expect(roleLog).toBeDefined();
      expect(roleLog?.changes).toEqual({
        projectRole: { from: "MEMBER", to: "TEAM_LEAD" },
      });

      // Try demoting the last PM (pmId) to MEMBER -> rejects with 400
      await expect(
        projectMemberService.changeRole(pmCtx, projectId, { userId: pmId, projectRole: "MEMBER" }),
      ).rejects.toThrow("A project needs at least one PM");
    });

    it("rejects changeRole for non-lead members and archived projects", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");

      const memberCtx = await createMockContext("MEMBER");
      await projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: memberCtx.user?.id ?? "",
        projectRole: "MEMBER",
        createdAt: new Date(),
      });

      // Member cannot change role (403)
      await expect(
        projectMemberService.changeRole(memberCtx, projectId, {
          userId: pmCtx.user?.id ?? "",
          projectRole: "TEAM_LEAD",
        }),
      ).rejects.toThrow(ForbiddenError);

      // Archived project rejects changeRole
      const adminCtx = await createMockContext("ADMIN");
      await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);
      await expect(
        projectMemberService.changeRole(adminCtx, projectId, {
          userId: memberCtx.user?.id ?? "",
          projectRole: "TEAM_LEAD",
        }),
      ).rejects.toThrow("This project is archived");
    });

    it("handles version conflict and database errors in removeMember and changeRole", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");
      const member = await userRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        email: `conflict-${Date.now()}@example.com`,
        fullName: "Conflict Member",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: member.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      });

      const originalBatch = pmCtx.db.batch.bind(pmCtx.db);

      // Version conflict in removeMember
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("CHECK constraint failed: version_conflict"));
      await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: member.id })).rejects.toThrow(
        ConflictError,
      );

      // Unexpected error in removeMember
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("Database connection dropped"));
      await expect(projectMemberService.removeMember(pmCtx, projectId, { userId: member.id })).rejects.toThrow(
        "Database connection dropped",
      );

      // Version conflict in changeRole
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("CHECK constraint failed: version_conflict"));
      await expect(
        projectMemberService.changeRole(pmCtx, projectId, { userId: member.id, projectRole: "TEAM_LEAD" }),
      ).rejects.toThrow(ConflictError);

      // Unexpected error in changeRole
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("Database connection dropped"));
      await expect(
        projectMemberService.changeRole(pmCtx, projectId, { userId: member.id, projectRole: "TEAM_LEAD" }),
      ).rejects.toThrow("Database connection dropped");

      pmCtx.db.batch = originalBatch;
    });

    it("handles unique constraint and unexpected errors in addMember", async () => {
      const pmCtx = await createMockContext("PM");
      const { projectId } = await createTestProject(pmCtx, pmCtx.user?.id ?? "");
      const user = await userRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        email: `add-err-${Date.now()}@example.com`,
        fullName: "Add Err User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const originalBatch = pmCtx.db.batch.bind(pmCtx.db);

      // Race condition duplicate insert
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("UNIQUE constraint failed: project_members.project_id"));
      await expect(
        projectMemberService.addMember(pmCtx, projectId, { userId: user.id, projectRole: "MEMBER" }),
      ).rejects.toThrow("Already a member");

      // Unexpected error
      pmCtx.db.batch = vi.fn().mockRejectedValueOnce(new Error("Disk quota exceeded"));
      await expect(
        projectMemberService.addMember(pmCtx, projectId, { userId: user.id, projectRole: "MEMBER" }),
      ).rejects.toThrow("Disk quota exceeded");

      pmCtx.db.batch = originalBatch;
    });
  });
});
