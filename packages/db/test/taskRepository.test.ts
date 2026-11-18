import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { compactBatch, conflictGuardStmt, isVersionConflict } from "../src/batch";
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

  it("FR-16 c1 / c3: listProjectTasks supports filters (sprintId, backlog, status, priority, assignee) and sort orders", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const sprint = await sprintRepository.insert(db, {
      id: crypto.randomUUID(),
      projectId: projectA.id,
      name: "Repo Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: now,
      updatedAt: now,
    });

    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: t1,
        projectId: projectA.id,
        statusId: status.id,
        sprintId: sprint.id,
        title: "Sprint task with due date",
        priority: "HIGH",
        dueDate: "2026-11-20",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: t2,
        projectId: projectA.id,
        statusId: status.id,
        sprintId: null,
        title: "Backlog task without due date",
        priority: "LOW",
        dueDate: null,
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, t1, [user.id], now),
    ]);

    // Test sprintId filter
    const sprintRes = await taskRepository.listProjectTasks(db, {
      projectId: projectA.id,
      sprintId: sprint.id,
    });
    expect(sprintRes.items.length).toBe(1);
    expect(sprintRes.items[0]?.id).toBe(t1);

    // Test backlog filter
    const backlogRes = await taskRepository.listProjectTasks(db, {
      projectId: projectA.id,
      sprintId: "backlog",
    });
    expect(backlogRes.items.length).toBe(1);
    expect(backlogRes.items[0]?.id).toBe(t2);

    // Test assignee filter
    const assigneeRes = await taskRepository.listProjectTasks(db, {
      projectId: projectA.id,
      assigneeId: user.id,
    });
    expect(assigneeRes.items.length).toBe(1);
    expect(assigneeRes.items[0]?.id).toBe(t1);

    // Test status and priority filters
    const statusRes = await taskRepository.listProjectTasks(db, {
      projectId: projectA.id,
      statusId: status.id,
    });
    expect(statusRes.items.length).toBe(2);

    const priorityRes = await taskRepository.listProjectTasks(db, {
      projectId: projectA.id,
      priority: "HIGH",
    });
    expect(priorityRes.items.length).toBe(1);
    expect(priorityRes.items[0]?.id).toBe(t1);
  });

  it("FR-16 c1 / c4: listMyTasks supports dueRange filters (today, week, overdue) and empty allowedProjectIds", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const emptyRes = await taskRepository.listMyTasks(db, {
      userId: user.id,
      allowedProjectIds: [],
    });
    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.total).toBe(0);

    const tOverdue = crypto.randomUUID();
    const tToday = crypto.randomUUID();
    const tWeek = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: tOverdue,
        projectId: projectA.id,
        statusId: status.id,
        title: "Overdue task",
        dueDate: "2026-11-10",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: tToday,
        projectId: projectA.id,
        statusId: status.id,
        title: "Today task",
        dueDate: "2026-11-17",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: tWeek,
        projectId: projectA.id,
        statusId: status.id,
        title: "Week task",
        dueDate: "2026-11-20",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, tOverdue, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(db, tToday, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(db, tWeek, [user.id], now),
    ]);

    const overdueRes = await taskRepository.listMyTasks(db, {
      userId: user.id,
      dueRange: "overdue",
      todayStr: "2026-11-17",
    });
    expect(overdueRes.items.some((t) => t.id === tOverdue)).toBe(true);

    const todayRes = await taskRepository.listMyTasks(db, {
      userId: user.id,
      dueRange: "today",
      todayStr: "2026-11-17",
    });
    expect(todayRes.items.some((t) => t.id === tToday)).toBe(true);

    const weekRes = await taskRepository.listMyTasks(db, {
      userId: user.id,
      dueRange: "week",
      todayStr: "2026-11-17",
      endOfWeekStr: "2026-11-24",
    });
    expect(weekRes.items.some((t) => t.id === tWeek)).toBe(true);
  });

  it("FR-13 c1 / A15: updateStmt updates fields, bumps version and succeeds with conflictGuardStmt", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Original title",
        description: "Original description",
        priority: "MEDIUM",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const initial = await taskRepository.findById(db, taskId);
    expect(initial?.version).toBe(1);

    const updateTime = new Date(now.getTime() + 5000);
    await db.batch([
      taskRepository.updateStmt(db, {
        id: taskId,
        expectedVersion: 1,
        title: "Updated title",
        description: "New description",
        priority: "URGENT",
        startDate: "2026-11-20",
        dueDate: "2026-11-25",
        now: updateTime,
      }),
      conflictGuardStmt(db),
    ]);

    const updated = await taskRepository.findById(db, taskId);
    expect(updated?.version).toBe(2);
    expect(updated?.title).toBe("Updated title");
    expect(updated?.description).toBe("New description");
    expect(updated?.priority).toBe("URGENT");
    expect(updated?.startDate).toBe("2026-11-20");
    expect(updated?.dueDate).toBe("2026-11-25");
  });

  it("FR-13 c2 / A15: updateStmt fails with conflictGuardStmt when expectedVersion is stale", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task with version 1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // First update bumps version to 2
    await db.batch([
      taskRepository.updateStmt(db, {
        id: taskId,
        expectedVersion: 1,
        title: "Version 2 title",
        now: new Date(now.getTime() + 1000),
      }),
      conflictGuardStmt(db),
    ]);

    // Second update with stale version 1 must fail due to conflictGuardStmt
    let conflictCaught = false;
    try {
      await db.batch([
        taskRepository.updateStmt(db, {
          id: taskId,
          expectedVersion: 1, // Stale! Current is 2
          title: "Conflicting title",
          now: new Date(now.getTime() + 2000),
        }),
        conflictGuardStmt(db),
      ]);
    } catch (err) {
      conflictCaught = isVersionConflict(err);
    }

    expect(conflictCaught).toBe(true);

    const finalTask = await taskRepository.findById(db, taskId);
    expect(finalTask?.version).toBe(2);
    expect(finalTask?.title).toBe("Version 2 title");
  });

  it("A15: updateSubtasksSprintStmt updates sprint on sub-tasks", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const sprint = await sprintRepository.insert(db, {
      id: crypto.randomUUID(),
      projectId: projectA.id,
      name: "Subtask Sprint",
      startDate: "2026-12-01",
      endDate: "2026-12-15",
      createdAt: now,
      updatedAt: now,
    });

    const parentId = crypto.randomUUID();
    const sub1Id = crypto.randomUUID();
    const sub2Id = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: parentId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Parent Task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: sub1Id,
        projectId: projectA.id,
        statusId: status.id,
        parentTaskId: parentId,
        title: "Subtask 1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: sub2Id,
        projectId: projectA.id,
        statusId: status.id,
        parentTaskId: parentId,
        title: "Subtask 2",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Update parent's subtasks sprint
    await db.batch([taskRepository.updateSubtasksSprintStmt(db, parentId, sprint.id, new Date())]);

    const sub1 = await taskRepository.findById(db, sub1Id);
    const sub2 = await taskRepository.findById(db, sub2Id);

    expect(sub1?.sprintId).toBe(sprint.id);
    expect(sub2?.sprintId).toBe(sprint.id);
  });

  it("FR-13 c1: findDetailsById and listSubtasks retrieve joined task detail and subtasks", async () => {
    const { db, now, user, projectA, status } = await createBaseFixtures();

    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: parentId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Parent Task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: childId,
        projectId: projectA.id,
        statusId: status.id,
        parentTaskId: parentId,
        title: "Child Subtask",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const details = await taskRepository.findDetailsById(db, childId);
    expect(details).toBeDefined();
    expect(details?.id).toBe(childId);
    expect(details?.projectCode).toBe(projectA.code);
    expect(details?.projectName).toBe(projectA.name);
    expect(details?.creatorName).toBe(user.fullName);
    expect(details?.parentTaskId).toBe(parentId);
    expect(details?.parentTaskTitle).toBe("Parent Task");

    const subtasks = await taskRepository.listSubtasks(db, parentId);
    expect(subtasks.length).toBe(1);
    expect(subtasks[0]?.id).toBe(childId);
    expect(subtasks[0]?.title).toBe("Child Subtask");
  });

  it("A17: updates task version with guard and replaces assignees via deleteByTaskIdStmt", async () => {
    const { db, user, projectA, status, now } = await createBaseFixtures();
    const taskId = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Assignment Test Task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user.id], now),
    ]);

    const initialAssignees = await taskAssigneeRepository.findUserIdsByTaskId(db, taskId);
    expect(initialAssignees).toEqual([user.id]);

    const later = new Date(now.getTime() + 1000);
    // Replace assignees: delete existing, update version
    await db.batch([
      taskRepository.updateVersionStmt(db, { id: taskId, expectedVersion: 1, now: later }),
      conflictGuardStmt(db),
      taskAssigneeRepository.deleteByTaskIdStmt(db, taskId),
    ]);

    const afterTask = await taskRepository.findById(db, taskId);
    expect(afterTask?.version).toBe(2);
    const afterAssignees = await taskAssigneeRepository.findUserIdsByTaskId(db, taskId);
    expect(afterAssignees).toEqual([]);

    // Stale version guard test
    await expect(
      db.batch([
        taskRepository.updateVersionStmt(db, { id: taskId, expectedVersion: 1, now: later }),
        conflictGuardStmt(db),
      ]),
    ).rejects.toThrow();
  });

  it("FR-14 c1 / A20: archives task with expected version and cascades soft delete to sub-tasks", async () => {
    const { db, user, projectA, status, now } = await createBaseFixtures();
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: parentId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Parent Task to Archive",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: childId,
        projectId: projectA.id,
        statusId: status.id,
        parentTaskId: parentId,
        title: "Child Subtask to Archive",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const archiveTime = new Date(now.getTime() + 2000);

    // Batch A20: archiveWithVersionStmt + conflictGuardStmt + archiveSubtasksStmt
    await db.batch([
      taskRepository.archiveWithVersionStmt(db, { id: parentId, expectedVersion: 1, now: archiveTime }),
      conflictGuardStmt(db),
      taskRepository.archiveSubtasksStmt(db, { parentTaskId: parentId, now: archiveTime }),
    ]);

    // Parent should be soft-deleted
    const parent = await taskRepository.findById(db, parentId);
    expect(parent).toBeUndefined();
    const rawParent = await db.query.tasks.findFirst({ where: eq(tasks.id, parentId) });
    expect(rawParent?.deletedAt).toEqual(archiveTime);

    // Child should also be soft-deleted
    const child = await taskRepository.findById(db, childId);
    expect(child).toBeUndefined();
    const rawChild = await db.query.tasks.findFirst({ where: eq(tasks.id, childId) });
    expect(rawChild?.deletedAt).toEqual(archiveTime);
  });

  it("FR-14 c1 / A20: fails with conflict guard when archiving with stale version", async () => {
    const { db, user, projectA, status, now } = await createBaseFixtures();
    const taskId = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Task with Version 1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const archiveTime = new Date(now.getTime() + 2000);

    // Archiving with expectedVersion: 99 should fail conflictGuardStmt
    let caught: unknown = null;
    try {
      await db.batch([
        taskRepository.archiveWithVersionStmt(db, { id: taskId, expectedVersion: 99, now: archiveTime }),
        conflictGuardStmt(db),
      ]);
    } catch (err) {
      caught = err;
    }
    expect(isVersionConflict(caught)).toBe(true);
  });

  it("FR-36 c4 / A13: clearSprintBySprintIdStmt unlinks sprint and increments version on tasks", async () => {
    const { db, user, projectA, status, now } = await createBaseFixtures();
    const sprintId = crypto.randomUUID();

    await sprintRepository.insert(db, {
      id: sprintId,
      projectId: projectA.id,
      name: "Sprint to Unlink",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: now,
      updatedAt: now,
    });

    const task1Id = crypto.randomUUID();
    const task2Id = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: task1Id,
        projectId: projectA.id,
        statusId: status.id,
        sprintId,
        title: "Sprint Task 1",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2Id,
        projectId: projectA.id,
        statusId: status.id,
        sprintId,
        title: "Sprint Task 2",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const unlinkTime = new Date(now.getTime() + 5000);
    await db.batch([taskRepository.clearSprintBySprintIdStmt(db, { sprintId, now: unlinkTime })]);

    const t1 = await taskRepository.findById(db, task1Id);
    const t2 = await taskRepository.findById(db, task2Id);

    expect(t1?.sprintId).toBeNull();
    expect(t1?.version).toBe(2);
    expect(t1?.updatedAt).toEqual(unlinkTime);

    expect(t2?.sprintId).toBeNull();
    expect(t2?.version).toBe(2);
    expect(t2?.updatedAt).toEqual(unlinkTime);
  });

  it("FR-21 c1 / A16: updateStatusStmt updates statusId, statusChangedAt, bumps version, preserves completedAt when omitted, and guards stale version", async () => {
    const { db, user, projectA, status, now } = await createBaseFixtures();
    const inProgressStatus = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `InProgress-${crypto.randomUUID()}`,
      category: "IN_PROGRESS",
      position: 2,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: projectA.id,
        statusId: status.id,
        title: "Status Transition Repo Task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const moveTime = new Date(now.getTime() + 10_000);
    await db.batch([
      taskRepository.updateStatusStmt(db, {
        id: taskId,
        expectedVersion: 1,
        statusId: inProgressStatus.id,
        now: moveTime,
      }),
      conflictGuardStmt(db),
    ]);

    const moved = await taskRepository.findById(db, taskId);
    expect(moved?.statusId).toBe(inProgressStatus.id);
    expect(moved?.statusChangedAt).toEqual(moveTime);
    expect(moved?.completedAt).toBeNull();
    expect(moved?.version).toBe(2);
    expect(moved?.updatedAt).toEqual(moveTime);

    let conflict = false;
    try {
      await db.batch([
        taskRepository.updateStatusStmt(db, {
          id: taskId,
          expectedVersion: 1,
          statusId: status.id,
          now: new Date(moveTime.getTime() + 1000),
        }),
        conflictGuardStmt(db),
      ]);
    } catch (err) {
      conflict = isVersionConflict(err);
    }
    expect(conflict).toBe(true);
  });
});
