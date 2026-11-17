import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  auditLogRepository,
  createDatabase,
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  userRepository,
} from "@pm/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@pm/domain";
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
});
