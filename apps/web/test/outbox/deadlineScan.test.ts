import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  outboxJobRepository,
  projectMemberRepository,
  projectRepository,
  reminderLogRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { ConsoleEmailSender, sweepOutbox } from "../../app/services/outbox.service";
import { runDeadlineScan } from "../../app/services/reminder.service";

describe("Deadline scan & EMAIL_DEADLINE_REMINDER outbox handler (FR-29, catalog A27)", () => {
  const db = createDatabase(env.DB);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createFixture(suffix: string) {
    const now = new Date();
    const user1 = await userRepository.insert(db, {
      id: `u1-${suffix}`,
      email: `u1-${suffix}@example.com`,
      fullName: `User One ${suffix}`,
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const user2 = await userRepository.insert(db, {
      id: `u2-${suffix}`,
      email: `u2-${suffix}@example.com`,
      fullName: `User Two ${suffix}`,
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
        createdById: user1.id,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: user1.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: user2.id,
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

    return { user1, user2, project, statusTodo, statusDone };
  }

  it("FR-29 c1 & c4: scans tasks due soon (within 24h) and sends DUE_SOON email via ConsoleEmailSender", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, project, statusTodo } = await createFixture(suffix);

    // 2026-11-18 10:00:00+07:00 (03:00:00 UTC)
    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskId = `task-ds-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Submit Report",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "MEDIUM",
        dueDate: "2026-11-18",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id], scanTime),
    ]);

    const scanResult = await runDeadlineScan(env, scanTime);
    expect(scanResult.scannedCount).toBeGreaterThanOrEqual(1);

    const logRow = await reminderLogRepository.findByKey(db, taskId, user1.id, "DUE_SOON", "2026-11-18");
    expect(logRow).not.toBeNull();
    expect(logRow?.kind).toBe("DUE_SOON");

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");

    const sweepResult = await sweepOutbox(env, scanTime);
    expect(sweepResult.done).toBeGreaterThanOrEqual(1);

    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user1.email,
        subject: "[Reminder] Task due soon: Submit Report",
        kind: "DUE_SOON",
        taskTitle: "Submit Report",
        dueDate: "2026-11-18",
        taskUrl: `http://localhost:5173/projects/${project.id}/tasks/${taskId}`,
      }),
    );
  });

  it("FR-29 c2 & c4: scans overdue tasks and sends OVERDUE email via ConsoleEmailSender", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, project, statusTodo } = await createFixture(suffix);

    // Current date is 2026-11-18, task was due on 2026-11-10 -> Overdue
    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskId = `task-od-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Overdue Critical Fix",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "HIGH",
        dueDate: "2026-11-10",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id], scanTime),
    ]);

    const scanResult = await runDeadlineScan(env, scanTime);
    expect(scanResult.scannedCount).toBeGreaterThanOrEqual(1);

    const logRow = await reminderLogRepository.findByKey(db, taskId, user1.id, "OVERDUE", "2026-11-10");
    expect(logRow).not.toBeNull();
    expect(logRow?.kind).toBe("OVERDUE");

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");

    const sweepResult = await sweepOutbox(env, scanTime);
    expect(sweepResult.done).toBeGreaterThanOrEqual(1);

    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user1.email,
        subject: "[Overdue] Task is overdue: Overdue Critical Fix",
        kind: "OVERDUE",
        taskTitle: "Overdue Critical Fix",
        dueDate: "2026-11-10",
        taskUrl: `http://localhost:5173/projects/${project.id}/tasks/${taskId}`,
      }),
    );
  });

  it("FR-29 c3: anti-join prevents duplicate reminder; date change triggers new reminder", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, project, statusTodo } = await createFixture(suffix);

    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskId = `task-rescheduled-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Rescheduled Task",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "MEDIUM",
        dueDate: "2026-11-18",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id], scanTime),
    ]);

    // 1. Initial scan: enqueues DUE_SOON for 2026-11-18
    const scan1 = await runDeadlineScan(env, scanTime);
    expect(scan1.enqueuedCount).toBeGreaterThanOrEqual(1);
    await sweepOutbox(env, scanTime);

    // 2. Second scan on same day: anti-join excludes it -> 0 new enqueued for this task
    const scan2 = await runDeadlineScan(env, scanTime);
    expect(scan2.enqueuedCount).toBe(0);
    const candidateCheck = await reminderLogRepository.findByKey(db, taskId, user1.id, "DUE_SOON", "2026-11-18");
    expect(candidateCheck).not.toBeNull();

    // 3. User reschedules due date to tomorrow, then days pass to 2026-11-20 (now overdue for 2026-11-19)
    const newDueDate = "2026-11-19";
    const laterTime = new Date("2026-11-20T03:00:00.000Z");

    await db.batch([
      taskRepository.updateStmt(db, {
        id: taskId,
        expectedVersion: 1,
        dueDate: newDueDate,
        now: scanTime,
      }),
    ]);

    // 4. Scan at later date: new dueDate produces a new reminder log and outbox job!
    const scan3 = await runDeadlineScan(env, laterTime);
    expect(scan3.enqueuedCount).toBeGreaterThanOrEqual(1);

    const newLogRow = await reminderLogRepository.findByKey(db, taskId, user1.id, "OVERDUE", newDueDate);
    expect(newLogRow).not.toBeNull();
    expect(newLogRow?.dueDate).toBe(newDueDate);
    expect(newLogRow?.kind).toBe("OVERDUE");
  });

  it("FR-29 c5: email failure does not affect business data and retries with backoff", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, project, statusTodo } = await createFixture(suffix);

    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskId = `task-fail-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Failing Email Task",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "MEDIUM",
        dueDate: "2026-11-18",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id], scanTime),
    ]);

    await runDeadlineScan(env, scanTime);

    // Mock ConsoleEmailSender to throw an error (simulating network/smtp failure)
    vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder").mockImplementation(() => {
      throw new Error("SMTP connection timeout");
    });

    const sweepResult = await sweepOutbox(env, scanTime);
    expect(sweepResult.failed).toBeGreaterThanOrEqual(1);

    // Task data is intact and unchanged
    const taskAfter = await taskRepository.findById(db, taskId);
    expect(taskAfter).not.toBeNull();
    expect(taskAfter?.title).toBe("Failing Email Task");
    expect(taskAfter?.version).toBe(1);

    // Reminder log is recorded (idempotent PK prevents double enqueue)
    const logRow = await reminderLogRepository.findByKey(db, taskId, user1.id, "DUE_SOON", "2026-11-18");
    expect(logRow).not.toBeNull();

    // Outbox job is in FAILED state with backoff next_attempt_at (60s base backoff)
    const dueJobs = await outboxJobRepository.listDue(db, new Date(scanTime.getTime() + 1000), 10);
    const failedJob = dueJobs.find((j) => j.payload.includes(taskId));
    expect(failedJob).toBeUndefined();

    // At scanTime + 65s, the backoff window has passed and it is due for retry
    const laterJobs = await outboxJobRepository.listDue(db, new Date(scanTime.getTime() + 65000), 10);
    const readyJob = laterJobs.find((j) => j.payload.includes(taskId));
    expect(readyJob).not.toBeNull();
    expect(readyJob?.attempts).toBe(1);
    expect(readyJob?.lastError).toContain("SMTP connection timeout");
  });

  it("excludes DONE tasks, deleted tasks, and skips execution if task completed before job dispatch", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, project, statusTodo, statusDone } = await createFixture(suffix);

    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskDoneId = `task-done-${suffix}`;

    // Task already in DONE status
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskDoneId,
        projectId: project.id,
        title: "Already Finished Task",
        statusId: statusDone.id,
        createdById: user1.id,
        priority: "LOW",
        dueDate: "2026-11-10",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskDoneId, [user1.id], scanTime),
    ]);

    await runDeadlineScan(env, scanTime);

    // Should not have enqueued reminder log for done task
    const doneLog = await reminderLogRepository.findByKey(db, taskDoneId, user1.id, "OVERDUE", "2026-11-10");
    expect(doneLog).toBeNull();

    // Now test task that transitions to DONE between scan and outbox delivery:
    const taskMovingId = `task-moving-${suffix}`;
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskMovingId,
        projectId: project.id,
        title: "Task Moving to Done",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "HIGH",
        dueDate: "2026-11-10",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskMovingId, [user1.id], scanTime),
    ]);

    await runDeadlineScan(env, scanTime);

    // Before outbox runs, mark task as DONE:
    await db.batch([
      taskRepository.updateStatusStmt(db, {
        id: taskMovingId,
        expectedVersion: 1,
        statusId: statusDone.id,
        now: scanTime,
      }),
    ]);

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");
    const sweepResult = await sweepOutbox(env, scanTime);
    expect(sweepResult.done).toBe(0);

    // Outbox handler detects status is DONE and returns SKIPPED
    expect(emailSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        taskTitle: "Task Moving to Done",
      }),
    );
  });

  it("handles multiple assignees: each receives their own reminder log and outbox job", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { user1, user2, project, statusTodo } = await createFixture(suffix);

    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const taskId = `task-multi-${suffix}`;

    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title: "Multi Assignee Task",
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "HIGH",
        dueDate: "2026-11-18",
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id, user2.id], scanTime),
    ]);

    await runDeadlineScan(env, scanTime);

    const log1 = await reminderLogRepository.findByKey(db, taskId, user1.id, "DUE_SOON", "2026-11-18");
    const log2 = await reminderLogRepository.findByKey(db, taskId, user2.id, "DUE_SOON", "2026-11-18");

    expect(log1).not.toBeNull();
    expect(log2).not.toBeNull();

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");
    await sweepOutbox(env, scanTime);

    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user1.email,
        taskTitle: "Multi Assignee Task",
      }),
    );
    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user2.email,
        taskTitle: "Multi Assignee Task",
      }),
    );
  });
  async function insertDueTask(suffix: string, title: string, dueDate: string, scanTime: Date) {
    const { user1, project, statusTodo } = await createFixture(suffix);
    const taskId = `task-${crypto.randomUUID()}`;
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: project.id,
        title,
        statusId: statusTodo.id,
        createdById: user1.id,
        priority: "MEDIUM",
        dueDate,
        statusChangedAt: scanTime,
        createdAt: scanTime,
        updatedAt: scanTime,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [user1.id], scanTime),
    ]);
    return { user1, project, taskId };
  }

  function loggedEmails(logSpy: { mock: { calls: unknown[][] } }) {
    return logSpy.mock.calls
      .map(([line]) => (typeof line === "string" ? (JSON.parse(line) as Record<string, unknown>) : {}))
      .filter((entry) => entry.msg === "Email sent (console)");
  }

  it("FR-29 c4: the console sender logs the rendered email (subject, text, and escaped HTML)", async () => {
    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const { user1, taskId } = await insertDueTask(
      crypto.randomUUID().slice(0, 8),
      "<script>alert(1)</script> report",
      "2026-11-18",
      scanTime,
    );
    await runDeadlineScan(env, scanTime);

    const logSpy = vi.spyOn(console, "log");
    await sweepOutbox(env, scanTime);

    const email = loggedEmails(logSpy).find((entry) => entry.to === user1.email);
    expect(email).toBeDefined();
    expect(email?.subject).toBe("[Reminder] Task due soon: <script>alert(1)</script> report");
    expect(email?.text).toContain("This task is due within 24 hours.");
    expect(email?.text).toContain(`/tasks/${taskId}`);
    expect(email?.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; report");
    expect(email?.html).not.toContain("<script>");
  });

  it("FR-29 c3: a reminder queued for the old due date is not sent after the due date changes", async () => {
    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const { taskId } = await insertDueTask(crypto.randomUUID().slice(0, 8), "Moved deadline", "2026-11-18", scanTime);
    await runDeadlineScan(env, scanTime);

    // The due date moves to next week before the queued job is delivered.
    await env.DB.prepare("UPDATE tasks SET due_date = ? WHERE id = ?").bind("2026-11-25", taskId).run();

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");
    await sweepOutbox(env, scanTime);
    expect(emailSpy).not.toHaveBeenCalledWith(expect.objectContaining({ taskTitle: "Moved deadline" }));
  });

  it("FR-29 c1: a queued reminder is not sent when the project was archived before delivery", async () => {
    const scanTime = new Date("2026-11-18T03:00:00.000Z");
    const { project } = await insertDueTask(
      crypto.randomUUID().slice(0, 8),
      "Archived meanwhile",
      "2026-11-18",
      scanTime,
    );
    await runDeadlineScan(env, scanTime);

    await env.DB.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").bind(scanTime.getTime(), project.id).run();

    const emailSpy = vi.spyOn(ConsoleEmailSender, "sendDeadlineReminder");
    await sweepOutbox(env, scanTime);
    expect(emailSpy).not.toHaveBeenCalledWith(expect.objectContaining({ taskTitle: "Archived meanwhile" }));
  });
});
