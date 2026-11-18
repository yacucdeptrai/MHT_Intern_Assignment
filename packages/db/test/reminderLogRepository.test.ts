import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import {
  outboxJobRepository,
  projectMemberRepository,
  projectRepository,
  reminderLogRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src/index";

describe("reminderLogRepository (catalog A27, FR-29)", () => {
  const db = createDatabase(env.DB);

  async function createFixture(suffix: string) {
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: `user-${suffix}`,
      email: `user-${suffix}@example.com`,
      fullName: `User ${suffix}`,
      passwordHash: "hash",
      passwordIterations: 100000,
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = `proj-${suffix}`;
    const statusTodoId = `status-todo-${suffix}`;
    const statusDoneId = `status-done-${suffix}`;

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `P${suffix}`.slice(0, 10).toUpperCase(),
        name: `Project ${suffix}`,
        status: "ACTIVE",
        createdById: user.id,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `Todo ${suffix}`,
        category: "TODO",
        position: 0,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `Done ${suffix}`,
        category: "DONE",
        position: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const project = await projectRepository.findById(db, projectId);
    const statusTodo = await taskStatusRepository.findById(db, statusTodoId);
    const statusDone = await taskStatusRepository.findById(db, statusDoneId);
    if (!project || !statusTodo || !statusDone) {
      throw new Error("Fixture creation failed");
    }

    return { user, project, statusTodo, statusDone };
  }

  it("A27: insertLogStmt and insertJobIfNewStmt enqueue job only when reminder_log row is newly inserted", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user, project, statusTodo } = await createFixture(suffix);
    const now = new Date();
    const taskId = `task-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Deadline Task",
        statusId: statusTodo.id,
        createdById: user.id,
        priority: "MEDIUM",
        dueDate: "2026-11-18",
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const jobId1 = crypto.randomUUID();
    const payload1 = JSON.stringify({
      taskId,
      userId: user.id,
      kind: "DUE_SOON",
      dueDate: "2026-11-18",
    });

    // First time: row is new -> changes() = 1 -> job is inserted
    await db.batch([
      reminderLogRepository.insertLogStmt(db, {
        taskId,
        userId: user.id,
        kind: "DUE_SOON",
        dueDate: "2026-11-18",
        sentAt: now,
      }),
      reminderLogRepository.insertJobIfNewStmt(db, {
        id: jobId1,
        payload: payload1,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const logRow = await reminderLogRepository.findByKey(db, taskId, user.id, "DUE_SOON", "2026-11-18");
    expect(logRow).not.toBeNull();
    expect(logRow?.taskId).toBe(taskId);
    expect(logRow?.kind).toBe("DUE_SOON");

    const job1 = await outboxJobRepository.findById(db, jobId1);
    expect(job1).not.toBeNull();
    expect(job1?.type).toBe("EMAIL_DEADLINE_REMINDER");

    // Second time: row already exists -> changes() = 0 -> job is NOT inserted
    const jobId2 = crypto.randomUUID();
    const payload2 = JSON.stringify({
      taskId,
      userId: user.id,
      kind: "DUE_SOON",
      dueDate: "2026-11-18",
    });

    await db.batch([
      reminderLogRepository.insertLogStmt(db, {
        taskId,
        userId: user.id,
        kind: "DUE_SOON",
        dueDate: "2026-11-18",
        sentAt: now,
      }),
      reminderLogRepository.insertJobIfNewStmt(db, {
        id: jobId2,
        payload: payload2,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const job2 = await outboxJobRepository.findById(db, jobId2);
    expect(job2).toBeNull();
  });

  it("findCandidateTasks selects due soon and overdue tasks, anti-joining reminder_log", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user, project, statusTodo, statusDone } = await createFixture(suffix);
    const now = new Date();

    const taskOverdueId = `task-od-${suffix}`;
    const taskDueSoonId = `task-ds-${suffix}`;
    const taskDoneId = `task-done-${suffix}`;

    await db.batch([
      // Task 1: Overdue task (due 2026-11-10 < today 2026-11-18)
      taskRepository.insertStmt(db, {
        id: taskOverdueId,
        projectId: project.id,
        title: "Overdue Task",
        statusId: statusTodo.id,
        createdById: user.id,
        priority: "HIGH",
        dueDate: "2026-11-10",
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskOverdueId, [user.id], now),

      // Task 2: Due soon task (due 2026-11-18 = today)
      taskRepository.insertStmt(db, {
        id: taskDueSoonId,
        projectId: project.id,
        title: "Due Soon Task",
        statusId: statusTodo.id,
        createdById: user.id,
        priority: "MEDIUM",
        dueDate: "2026-11-18",
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskDueSoonId, [user.id], now),

      // Task 3: Done task (should be excluded)
      taskRepository.insertStmt(db, {
        id: taskDoneId,
        projectId: project.id,
        title: "Done Task",
        statusId: statusDone.id,
        createdById: user.id,
        priority: "LOW",
        dueDate: "2026-11-10",
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskDoneId, [user.id], now),
    ]);

    // Initial scan with todayStr = "2026-11-18"
    const candidates1 = await reminderLogRepository.findCandidateTasks(db, "2026-11-18");
    const ourCandidates = candidates1.filter((c) => c.userId === user.id);

    expect(ourCandidates).toHaveLength(2);
    const od = ourCandidates.find((c) => c.taskId === taskOverdueId);
    const ds = ourCandidates.find((c) => c.taskId === taskDueSoonId);

    expect(od?.kind).toBe("OVERDUE");
    expect(ds?.kind).toBe("DUE_SOON");

    // Mark taskOverdue as reminded for OVERDUE
    await db.batch([
      reminderLogRepository.insertLogStmt(db, {
        taskId: taskOverdueId,
        userId: user.id,
        kind: "OVERDUE",
        dueDate: "2026-11-10",
        sentAt: now,
      }),
    ]);

    // Second scan: taskOverdue should be excluded by anti-join
    const candidates2 = await reminderLogRepository.findCandidateTasks(db, "2026-11-18");
    const ourCandidates2 = candidates2.filter((c) => c.userId === user.id);

    expect(ourCandidates2).toHaveLength(1);
    expect(ourCandidates2[0]?.taskId).toBe(taskDueSoonId);

    expect(ourCandidates2).toHaveLength(1);
    expect(ourCandidates2[0]?.taskId).toBe(taskDueSoonId);
  });
});
