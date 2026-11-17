import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { compactBatch } from "../src/batch";
import { createDatabase } from "../src/client";
import {
  projectRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src/index";
import { tasks } from "../src/schema/tasks";
import { eq } from "drizzle-orm";

async function createBaseFixtures() {
  const db = createDatabase(env.DB);
  const now = new Date();

  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `task-user-${Date.now()}-${Math.random()}@example.com`,
    fullName: "Task Tester",
    systemRole: "MEMBER",
    status: "ACTIVE",
    passwordHash: "hash",
    passwordIterations: 100000,
    createdAt: now,
    updatedAt: now,
  });

  const projectA = {
    id: crypto.randomUUID(),
    code: `TKA${Date.now().toString().slice(-6)}`,
    name: "Task Project A",
    status: "ACTIVE" as const,
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    createdById: user.id,
    createdAt: now,
    updatedAt: now,
  };

  const projectB = {
    id: crypto.randomUUID(),
    code: `TKB${Date.now().toString().slice(-6)}`,
    name: "Task Project B",
    status: "ACTIVE" as const,
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    createdById: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.batch([projectRepository.insertStmt(db, projectA), projectRepository.insertStmt(db, projectB)]);

  const status = await taskStatusRepository.insert(db, {
    id: crypto.randomUUID(),
    name: `TaskStatus-${Date.now()}-${Math.random()}`,
    category: "TODO",
    position: 1,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  return { db, now, user, projectA, projectB, status };
}

describe("taskRepository", () => {
  it("FR-12 c1: allocates per-project sequential numbers", async () => {
    const { db, now, user, projectA, projectB, status } = await createBaseFixtures();

    const t1Id = crypto.randomUUID();
    const t2Id = crypto.randomUUID();
    const t3Id = crypto.randomUUID();

    // Insert 2 tasks for project A
    await db.batch([
      taskRepository.insertStmt(db, {
        id: t1Id,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task 1 in Project A",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    await db.batch([
      taskRepository.insertStmt(db, {
        id: t2Id,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task 2 in Project A",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Insert 1 task for project B
    await db.batch([
      taskRepository.insertStmt(db, {
        id: t3Id,
        projectId: projectB.id,
        statusId: status.id,
        title: "Task 1 in Project B",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const task1 = await taskRepository.findById(db, t1Id);
    const task2 = await taskRepository.findById(db, t2Id);
    const task3 = await taskRepository.findById(db, t3Id);

    expect(task1?.number).toBe(1);
    expect(task2?.number).toBe(2);
    expect(task3?.number).toBe(1); // Project B starts at 1
  });

  it("FR-12 c1: per-project number allocation race test", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    // Concurrently execute 5 task creations on the same project
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());

    await Promise.all(
      ids.map((id, index) =>
        db.batch([
          taskRepository.insertStmt(db, {
            id,
            projectId: projectA.id,
            statusId: status.id,
            title: `Concurrent task ${index}`,
            createdById: user.id,
            statusChangedAt: now,
            createdAt: now,
            updatedAt: now,
          }),
        ]),
      ),
    );

    const taskList = await taskRepository.listByProject(db, projectA.id);
    const numbers = taskList.map((t) => t.number);

    // Verify all 5 numbers are distinct from 1 to 5
    expect(numbers.length).toBe(5);
    expect(new Set(numbers).size).toBe(5);
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("FR-36 c3: rejects task linking to a sprint belonging to another project via composite FK", async () => {
    const { db, now, user, projectA, projectB, status } = await createBaseFixtures();

    // Create a sprint in Project B
    const sprintB = await sprintRepository.insert(db, {
      id: crypto.randomUUID(),
      projectId: projectB.id,
      name: "Sprint in Project B",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      createdAt: now,
      updatedAt: now,
    });

    // Try to create a task in Project A that references sprintB (belonging to Project B)
    const taskId = crypto.randomUUID();
    const insertAttempt = db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        sprintId: sprintB.id,
        statusId: status.id,
        title: "Cross project sprint task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    await expect(insertAttempt).rejects.toThrow();
  });

  it("FR-20 c3: countByStatusId counts all tasks using the status including archived", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const t1Id = crypto.randomUUID();
    const t2Id = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: t1Id,
        projectId: projectA.id,
        statusId: status.id,
        title: "Active task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: t2Id,
        projectId: projectA.id,
        statusId: status.id,
        title: "Archived task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Soft delete task 2
    await db.update(tasks).set({ deletedAt: now }).where(eq(tasks.id, t2Id));

    const count = await taskRepository.countByStatusId(db, status.id);
    expect(count).toBe(2);
  });

  it("FR-10 c4 / A5: deleteByMemberOnUnarchivedTasksStmt deletes unarchived assignments only in target project", async () => {
    const { db, now, user, projectA, projectB, status } = await createBaseFixtures();

    const taskA1 = crypto.randomUUID();
    const taskA2Archived = crypto.randomUUID();
    const taskB1 = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskA1,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task A1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: taskA2Archived,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task A2 Archived",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: taskB1,
        projectId: projectB.id,
        statusId: status.id,
        title: "Task B1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Archive task A2
    await db.update(tasks).set({ deletedAt: now }).where(eq(tasks.id, taskA2Archived));

    // Assign user to all 3 tasks
    await db.batch(
      compactBatch([
        ...taskAssigneeRepository.insertBatchStmt(db, taskA1, [user.id], now),
        ...taskAssigneeRepository.insertBatchStmt(db, taskA2Archived, [user.id], now),
        ...taskAssigneeRepository.insertBatchStmt(db, taskB1, [user.id], now),
      ]),
    );

    // Execute A5 delete for user on projectA
    await db.batch([taskAssigneeRepository.deleteByMemberOnUnarchivedTasksStmt(db, projectA.id, user.id)]);

    const assigneesA1 = await taskAssigneeRepository.findByTaskId(db, taskA1);
    const assigneesA2 = await taskAssigneeRepository.findByTaskId(db, taskA2Archived);
    const assigneesB1 = await taskAssigneeRepository.findByTaskId(db, taskB1);

    expect(assigneesA1.length).toBe(0); // Deleted!
    expect(assigneesA2.length).toBe(1); // Archived task assignment UNTOUCHED
    expect(assigneesB1.length).toBe(1); // Project B task assignment UNTOUCHED
  });
});
