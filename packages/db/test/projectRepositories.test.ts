import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { conflictGuardStmt, isVersionConflict } from "../src/batch";
import { createDatabase } from "../src/client";
import { auditLogRepository, projectMemberRepository, projectRepository, userRepository } from "../src/index";

describe("Project and ProjectMember repositories", () => {
  it("FR-07 c1: creates project and member atomically in a batch", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const creator = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `creator-${Date.now()}@example.com`,
      fullName: "Project Creator",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const auditId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: "PRJ-BATCH",
        name: "Batch Project",
        description: "Testing batch creation",
        budget: 10000000,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        slackChannelId: null,
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: creator.id,
        projectRole: "PM",
        createdAt: now,
      }),
      auditLogRepository.insertStmt(db, {
        id: auditId,
        actorId: creator.id,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: projectId,
        projectId,
        changes: { name: { from: null, to: "Batch Project" } },
        createdAt: now,
      }),
    ]);

    const project = await projectRepository.findById(db, projectId);
    expect(project).toBeDefined();
    expect(project?.code).toBe("PRJ-BATCH");
    expect(project?.name).toBe("Batch Project");
    expect(project?.budget).toBe(10000000);

    const membership = await projectMemberRepository.findByProjectAndUser(db, projectId, creator.id);
    expect(membership).toBeDefined();
    expect(membership?.projectRole).toBe("PM");

    const audit = await auditLogRepository.listByEntity(db, "PROJECT", projectId);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]?.action).toBe("PROJECT_CREATED");
  });

  it("FR-07 c2: findByCode finds projects case-insensitively including archived", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const creator = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `creator-code-${Date.now()}@example.com`,
      fullName: "Code Creator",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const activeId = crypto.randomUUID();
    const archivedId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: activeId,
        code: "PRJ-ACT",
        name: "Active Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: archivedId,
        code: "PRJ-ARC",
        name: "Archived Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: creator.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
    ]);

    const foundActive = await projectRepository.findByCode(db, "prj-act");
    expect(foundActive).toBeDefined();
    expect(foundActive?.id).toBe(activeId);

    const foundArchived = await projectRepository.findByCode(db, "prj-arc");
    expect(foundArchived).toBeDefined();
    expect(foundArchived?.id).toBe(archivedId);
  });

  it("listForUser returns only projects the user is a member of", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `u1-${Date.now()}@example.com`,
      fullName: "User One",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    const user2 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `u2-${Date.now()}@example.com`,
      fullName: "User Two",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const p1 = crypto.randomUUID();
    const p2 = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: p1,
        code: "PRJ-USER1",
        name: "Project For User 1",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user1.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId: p1,
        userId: user1.id,
        projectRole: "PM",
        createdAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: p2,
        code: "PRJ-USER2",
        name: "Project For User 2",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user2.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId: p2,
        userId: user2.id,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const user1Projects = await projectRepository.listForUser(db, user1.id);
    expect(user1Projects.some((p) => p.id === p1)).toBe(true);
    expect(user1Projects.some((p) => p.id === p2)).toBe(false);

    const user2Projects = await projectRepository.listForUser(db, user2.id);
    expect(user2Projects.some((p) => p.id === p2)).toBe(true);
    expect(user2Projects.some((p) => p.id === p1)).toBe(false);

    const allProjects = await projectRepository.listAll(db);
    expect(allProjects.some((p) => p.id === p1)).toBe(true);
    expect(allProjects.some((p) => p.id === p2)).toBe(true);
  });

  it("FR-08: updateStmt updates project fields with conflict guard", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const creator = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `creator-upd-${Date.now()}@example.com`,
      fullName: "Updater",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await projectRepository.insertStmt(db, {
      id: projectId,
      code: "PRJ-UPD",
      name: "Initial Name",
      description: "Initial description",
      budget: 5000000,
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: creator.id,
      createdAt: now,
      updatedAt: now,
    });

    const updateTime = new Date(now.getTime() + 1000);
    await db.batch([
      projectRepository.updateStmt(db, projectId, {
        name: "Updated Name",
        description: "New description",
        status: "ON_HOLD",
        updatedAt: updateTime,
      }),
      conflictGuardStmt(db),
    ]);

    const updated = await projectRepository.findById(db, projectId);
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.description).toBe("New description");
    expect(updated?.status).toBe("ON_HOLD");
  });

  it("FR-09: archiveStmt soft deletes project and listArchived lists it", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const creator = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `creator-arc-${Date.now()}@example.com`,
      fullName: "Archiver",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await projectRepository.insertStmt(db, {
      id: projectId,
      code: "PRJ-ARC2",
      name: "To Be Archived",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: creator.id,
      createdAt: now,
      updatedAt: now,
    });

    const archiveTime = new Date();
    await db.batch([projectRepository.archiveStmt(db, projectId, archiveTime), conflictGuardStmt(db)]);

    // Active findById returns null
    const notFoundActive = await projectRepository.findById(db, projectId);
    expect(notFoundActive).toBeNull();

    // findByIdIncludingArchived finds it
    const foundArchived = await projectRepository.findByIdIncludingArchived(db, projectId);
    expect(foundArchived).toBeDefined();
    expect(foundArchived?.deletedAt).not.toBeNull();

    // listArchived returns it
    const archivedList = await projectRepository.listArchived(db);
    expect(archivedList.some((p) => p.id === projectId)).toBe(true);

    // Repeated archive fails conflict guard (already deleted)
    let failed = false;
    try {
      await db.batch([projectRepository.archiveStmt(db, projectId, new Date()), conflictGuardStmt(db)]);
    } catch (err) {
      failed = true;
      expect(isVersionConflict(err)).toBe(true);
    }
    expect(failed).toBe(true);
  });
});
