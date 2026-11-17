import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import {
  inviteRepository,
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  userRepository,
} from "../src/index";

describe("Project Member and Notification repositories", () => {
  it("manages notifications with insertStmt, insertManyStmt, and listByUser", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `notify-user-${Date.now()}@example.com`,
      fullName: "Notify User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PRJ-N${Date.now().toString().slice(-4)}`,
        name: "Notification Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Test insertManyStmt with empty array returns null
    expect(notificationRepository.insertManyStmt(db, [])).toBeNull();

    // Test insertStmt
    const notificationId = crypto.randomUUID();
    await db.batch([
      notificationRepository.insertStmt(db, {
        id: notificationId,
        userId: user.id,
        type: "PROJECT_MEMBER_ADDED",
        entityId: projectId,
        projectId,
        payload: {
          title: "Added to project",
          actorName: "Admin User",
        },
        createdAt: now,
      }),
    ]);

    const userNotifications = await notificationRepository.listByUser(db, user.id);
    expect(userNotifications).toHaveLength(1);
    expect(userNotifications[0]?.id).toBe(notificationId);
    expect(userNotifications[0]?.payload.title).toBe("Added to project");
  });

  it("FR-10 c1: searches active non-members correctly", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    const pm = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `pm-${Date.now()}@example.com`,
      fullName: "Project PM",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PRJ-S${Date.now().toString().slice(-4)}`,
        name: "Search Test Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Add PM as member
    await projectMemberRepository.insertStmt(db, {
      projectId,
      userId: pm.id,
      projectRole: "PM",
      createdAt: now,
    });

    // Create Candidate 1 (Active, non-member)
    const candidate1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `search-candidate1-${Date.now()}@example.com`,
      fullName: "Alice Candidate",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    // Create Candidate 2 (LOCKED, non-member)
    await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `search-candidate2-${Date.now()}@example.com`,
      fullName: "Bob Locked",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: now,
      updatedAt: now,
    });

    // Create Candidate 3 (Soft deleted, non-member)
    await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `search-candidate3-${Date.now()}@example.com`,
      fullName: "Charlie Deleted",
      systemRole: "MEMBER",
      status: "ACTIVE",
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // PM is already member, candidate 2 is locked, candidate 3 is deleted
    const searchAll = await userRepository.searchActiveNonMembers(db, projectId, "");
    const foundCandidate1 = searchAll.find((u) => u.id === candidate1.id);
    const foundPm = searchAll.find((u) => u.id === pm.id);
    expect(foundCandidate1).toBeDefined();
    expect(foundPm).toBeUndefined();

    // Search by query (case-insensitive substring)
    const searchAlice = await userRepository.searchActiveNonMembers(db, projectId, "alice");
    expect(searchAlice).toHaveLength(1);
    expect(searchAlice[0]?.id).toBe(candidate1.id);

    const searchEmail = await userRepository.searchActiveNonMembers(db, projectId, candidate1.email);
    expect(searchEmail).toHaveLength(1);
    expect(searchEmail[0]?.id).toBe(candidate1.id);
  });

  it("counts members by role and lists members with user profiles", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    const u1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `u1-${Date.now()}@example.com`,
      fullName: "User One",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const u2 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `u2-${Date.now()}@example.com`,
      fullName: "User Two",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PRJ-M${Date.now().toString().slice(-4)}`,
        name: "Members Test Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: u1.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    await projectMemberRepository.insertStmt(db, {
      projectId,
      userId: u1.id,
      projectRole: "PM",
      createdAt: now,
    });

    await projectMemberRepository.insertStmt(db, {
      projectId,
      userId: u2.id,
      projectRole: "MEMBER",
      createdAt: now,
    });

    const pmCount = await projectMemberRepository.countByProjectAndRole(db, projectId, "PM");
    expect(pmCount).toBe(1);

    const memberCount = await projectMemberRepository.countByProjectAndRole(db, projectId, "MEMBER");
    expect(memberCount).toBe(1);

    const leadCount = await projectMemberRepository.countByProjectAndRole(db, projectId, "TEAM_LEAD");
    expect(leadCount).toBe(0);

    const membersWithUsers = await projectMemberRepository.listByProjectWithUser(db, projectId);
    expect(membersWithUsers).toHaveLength(2);
    expect(membersWithUsers.some((m) => m.userId === u1.id && m.projectRole === "PM")).toBe(true);
    expect(membersWithUsers.some((m) => m.userId === u2.id && m.projectRole === "MEMBER")).toBe(true);

    // Delete member
    await projectMemberRepository.deleteStmt(db, projectId, u2.id);
    const afterDelete = await projectMemberRepository.listByProject(db, projectId);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.userId).toBe(u1.id);
  });

  it("lists pending invites for a project excluding accepted and expired ones", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    const inviter = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `inviter-${Date.now()}@example.com`,
      fullName: "Inviter User",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PRJ-I${Date.now().toString().slice(-4)}`,
        name: "Invites Test Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: inviter.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Valid pending invite
    const validInvite = await inviteRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "valid-pending@example.com",
      tokenHash: "token-hash-1",
      projectId,
      projectRole: "MEMBER",
      invitedById: inviter.id,
      expiresAt: new Date(now.getTime() + 86400000),
      createdAt: now,
    });

    // Accepted invite
    await inviteRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "accepted@example.com",
      tokenHash: "token-hash-2",
      projectId,
      projectRole: "MEMBER",
      invitedById: inviter.id,
      expiresAt: new Date(now.getTime() + 86400000),
      acceptedAt: now,
      createdAt: now,
    });

    // Expired invite
    await inviteRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "expired@example.com",
      tokenHash: "token-hash-3",
      projectId,
      projectRole: "MEMBER",
      invitedById: inviter.id,
      expiresAt: new Date(now.getTime() - 86400000),
      createdAt: new Date(now.getTime() - 172800000),
    });

    const pending = await inviteRepository.listPendingByProject(db, projectId, now);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(validInvite.id);
  });
});
