import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { conflictGuardStmt, isVersionConflict } from "../src/batch";
import { createDatabase } from "../src/client";
import {
  projectRepository,
  sprintRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src/index";

describe("sprintRepository", () => {
  async function createFixtures() {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `user-${crypto.randomUUID()}@example.com`,
      fullName: "Sprint Tester",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `SP${crypto.randomUUID().slice(0, 6)}`.toUpperCase(),
        name: "Sprint Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    const project = await projectRepository.findById(db, projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const statusTodo = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `Todo-${Date.now()}-${Math.random()}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
    const statusDone = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `Done-${Date.now()}-${Math.random()}`,
      category: "DONE",
      position: 2,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    return { db, user, project, statusTodo, statusDone, now };
  }

  it("FR-36 c1 / A11: inserts sprint with insertStmt and finds it by id", async () => {
    const { db, project, now } = await createFixtures();
    const sprintId = crypto.randomUUID();

    await db.batch([
      sprintRepository.insertStmt(db, {
        id: sprintId,
        projectId: project.id,
        name: "Sprint 1",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const sprint = await sprintRepository.findById(db, sprintId);
    expect(sprint).toBeDefined();
    expect(sprint?.name).toBe("Sprint 1");
    expect(sprint?.projectId).toBe(project.id);
    expect(sprint?.startDate).toBe("2026-11-01");
    expect(sprint?.endDate).toBe("2026-11-14");
    expect(sprint?.deletedAt).toBeNull();
  });

  it("FR-36 c1 / A12: updates sprint and conflictGuardStmt prevents updating archived sprint", async () => {
    const { db, project, now } = await createFixtures();
    const sprintId = crypto.randomUUID();

    await sprintRepository.insert(db, {
      id: sprintId,
      projectId: project.id,
      name: "Original Sprint Name",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: now,
      updatedAt: now,
    });

    const updateTime = new Date(now.getTime() + 1000);
    await db.batch([
      sprintRepository.updateStmt(db, {
        id: sprintId,
        name: "Updated Sprint Name",
        startDate: "2026-11-05",
        endDate: "2026-11-20",
        now: updateTime,
      }),
      conflictGuardStmt(db),
    ]);

    const updated = await sprintRepository.findById(db, sprintId);
    expect(updated?.name).toBe("Updated Sprint Name");
    expect(updated?.startDate).toBe("2026-11-05");
    expect(updated?.endDate).toBe("2026-11-20");
    expect(updated?.updatedAt).toEqual(updateTime);

    // Conflict guard should fail if non-existent sprint is updated
    let caught: unknown = null;
    try {
      await db.batch([
        sprintRepository.updateStmt(db, {
          id: crypto.randomUUID(),
          name: "Ghost Sprint",
          now: updateTime,
        }),
        conflictGuardStmt(db),
      ]);
    } catch (err) {
      caught = err;
    }
    expect(isVersionConflict(caught)).toBe(true);
  });

  it("FR-36 c4 / A13: archiveStmt soft deletes sprint and guards against double-archive", async () => {
    const { db, project, now } = await createFixtures();
    const sprintId = crypto.randomUUID();

    await sprintRepository.insert(db, {
      id: sprintId,
      projectId: project.id,
      name: "Sprint to Archive",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: now,
      updatedAt: now,
    });

    const archiveTime = new Date(now.getTime() + 2000);
    await db.batch([sprintRepository.archiveStmt(db, sprintId, archiveTime), conflictGuardStmt(db)]);

    const active = await sprintRepository.findById(db, sprintId);
    expect(active).toBeUndefined();

    const archived = await sprintRepository.findByIdIncludingArchived(db, sprintId);
    expect(archived).toBeDefined();
    expect(archived?.deletedAt).toEqual(archiveTime);

    // Double archive should trigger conflict guard
    let caught: unknown = null;
    try {
      await db.batch([sprintRepository.archiveStmt(db, sprintId, archiveTime), conflictGuardStmt(db)]);
    } catch (err) {
      caught = err;
    }
    expect(isVersionConflict(caught)).toBe(true);
  });

  it("FR-36 / P11 / FR-31: listByProjectWithStats calculates completion rates correctly", async () => {
    const { db, user, project, statusTodo, statusDone, now } = await createFixtures();

    const sprint1Id = crypto.randomUUID();
    const sprint2Id = crypto.randomUUID();

    await db.batch([
      sprintRepository.insertStmt(db, {
        id: sprint1Id,
        projectId: project.id,
        name: "Active Sprint with Tasks",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        createdAt: now,
        updatedAt: now,
      }),
      sprintRepository.insertStmt(db, {
        id: sprint2Id,
        projectId: project.id,
        name: "Empty Sprint",
        startDate: "2026-11-15",
        endDate: "2026-11-30",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const parentTask1Id = crypto.randomUUID();
    const parentTask2Id = crypto.randomUUID();
    const subTaskId = crypto.randomUUID();
    const archivedTaskId = crypto.randomUUID();

    await db.batch([
      // Task 1 in TODO
      taskRepository.insertStmt(db, {
        id: parentTask1Id,
        projectId: project.id,
        statusId: statusTodo.id,
        sprintId: sprint1Id,
        title: "Top Task 1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Task 2 in DONE
      taskRepository.insertStmt(db, {
        id: parentTask2Id,
        projectId: project.id,
        statusId: statusDone.id,
        sprintId: sprint1Id,
        title: "Top Task 2 (Done)",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Sub-task under Task 1 (should NOT count towards completion rate)
      taskRepository.insertStmt(db, {
        id: subTaskId,
        projectId: project.id,
        parentTaskId: parentTask1Id,
        statusId: statusDone.id,
        sprintId: sprint1Id,
        title: "Sub-task (Done)",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Archived task (should NOT count)
      taskRepository.insertStmt(db, {
        id: archivedTaskId,
        projectId: project.id,
        statusId: statusDone.id,
        sprintId: sprint1Id,
        title: "Archived Task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.archiveWithVersionStmt(db, {
        id: archivedTaskId,
        expectedVersion: 1,
        now: new Date(now.getTime() + 100),
      }),
    ]);

    const stats = await sprintRepository.listByProjectWithStats(db, project.id);
    expect(stats.length).toBe(2);

    const s1 = stats.find((s) => s.id === sprint1Id);
    expect(s1).toBeDefined();
    // 2 top-level non-archived tasks: 1 TODO, 1 DONE
    expect(s1?.taskCount).toBe(2);
    expect(s1?.completedCount).toBe(1);

    const s2 = stats.find((s) => s.id === sprint2Id);
    expect(s2).toBeDefined();
    expect(s2?.taskCount).toBe(0);
    expect(s2?.completedCount).toBe(0);
  });
});
