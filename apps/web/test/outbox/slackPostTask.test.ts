import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  outboxJobRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { type JobContext, processJob } from "../../app/services/outbox.service";

describe("SLACK_POST_TASK outbox handler (FR-27)", () => {
  const db = createDatabase(env.DB);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockLogger() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  function createTestContext(now: Date, customEnv: Env = env, logger = createMockLogger()): JobContext {
    return {
      env: customEnv,
      db,
      logger,
      clock: { now: () => now },
    };
  }

  async function ensureUserAndProject(slackChannelId: string | null = "C_TEST_CHANNEL") {
    const userId = crypto.randomUUID();
    const now = new Date();
    await userRepository.insert(db, {
      id: userId,
      email: `slack-user-${userId.slice(0, 6)}@example.com`,
      fullName: "Slack Tester",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const code = `SLK${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code,
        name: `Slack Test Project ${code}`,
        description: "Testing Slack integration",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        slackChannelId,
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const project = await projectRepository.findById(db, projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    let status = await taskStatusRepository.findDefaultByCategory(db, "TODO");
    if (!status) {
      status = await taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: `To Do ${Date.now()}`,
        category: "TODO",
        position: 1,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { user: userId, project, statusId: status.id };
  }

  async function createTask(params: {
    id: string;
    projectId: string;
    statusId: string;
    parentTaskId?: string | null;
    title: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string | null;
    createdById: string;
    now: Date;
  }) {
    await db.batch([
      taskRepository.insertStmt(db, {
        id: params.id,
        projectId: params.projectId,
        statusId: params.statusId,
        parentTaskId: params.parentTaskId ?? null,
        title: params.title,
        priority: params.priority,
        dueDate: params.dueDate ?? null,
        createdById: params.createdById,
        createdAt: params.now,
        updatedAt: params.now,
        statusChangedAt: params.now,
      }),
    ]);
  }

  it("FR-27 c1: posts task details to project Slack channel with correct payload and updates slack_thread_ts", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "Integrate Slack Post",
      priority: "HIGH",
      dueDate: "2026-12-01",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
      APP_BASE_URL: "https://pm.example.com",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, ts: "1731930000.000100", channel: "C_MAIN_CHAN" }),
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);
    expect(outcome).toBe("DONE");

    // Verify Slack API call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer xoxb-mock-token",
      "Content-Type": "application/json; charset=utf-8",
    });

    const body = JSON.parse(options.body as string) as { channel: string; text: string };
    expect(body.channel).toBe("C_MAIN_CHAN");
    expect(body.text).toBe(
      `*${project.code}-1* Integrate Slack Post · Priority: HIGH · Due: 2026-12-01 · https://pm.example.com/projects/${project.id}/tasks/${taskId}`,
    );

    // Verify DB update
    const updatedTask = await taskRepository.findById(db, taskId);
    expect(updatedTask?.slackThreadTs).toBe("1731930000.000100");
  });

  it("FR-27 c1: formats Due: none when dueDate is not set", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "Task with no due date",
      priority: "MEDIUM",
      dueDate: null,
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
      APP_BASE_URL: "https://pm.example.com/",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, ts: "1731930000.000200", channel: "C_MAIN_CHAN" }),
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);
    expect(outcome).toBe("DONE");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { channel: string; text: string };
    expect(body.text).toContain("Due: none");
  });

  it("FR-27 c2: marks SKIPPED without calling fetch if SLACK_BOT_TOKEN is missing or empty", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "No token task",
      priority: "LOW",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "" };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FR-27 c2: marks SKIPPED without calling fetch if project has no slackChannelId", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject(null); // No channel

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "No channel task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FR-27 c3: marks SKIPPED without calling fetch for sub-tasks", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const parentTaskId = crypto.randomUUID();
    await createTask({
      id: parentTaskId,
      projectId: project.id,
      statusId,
      title: "Parent task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    const subTaskId = crypto.randomUUID();
    await createTask({
      id: subTaskId,
      projectId: project.id,
      statusId,
      parentTaskId,
      title: "Sub-task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId: subTaskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("idempotency: returns DONE without calling fetch if slack_thread_ts is already populated", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "Already posted task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    // Manually set slackThreadTs
    await db.batch([taskRepository.updateSlackThreadTsStmt(db, taskId, "1731930000.999999", now)]);

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("DONE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error handling: channel_not_found or not_in_channel returns SKIPPED with warning log", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_BAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "Channel not found task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
    } as Response);

    const logger = createMockLogger();
    const ctx = createTestContext(now, testEnv, logger);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("channel_not_found"), expect.anything());
  });

  it("error handling: Slack HTTP >= 500 throws so job retries", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, statusId } = await ensureUserAndProject("C_MAIN_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId,
      title: "HTTP 500 error task",
      priority: "MEDIUM",
      createdById: user,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("FAILED");
    const job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("FAILED");
    expect(job?.attempts).toBe(1);
  });
});
