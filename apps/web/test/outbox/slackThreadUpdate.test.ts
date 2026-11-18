import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commentRepository,
  createDatabase,
  outboxJobRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { type JobContext, processJob } from "../../app/services/outbox.service";

describe("SLACK_UPDATE_THREAD outbox handler (FR-28)", () => {
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
      email: `slack-thread-user-${userId.slice(0, 6)}@example.com`,
      fullName: "Alex Engineer",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const code = `THR${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code,
        name: `Slack Thread Project ${code}`,
        description: "Testing Slack thread integration",
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

    const todoStatus = await taskStatusRepository.findByName(db, "To Do");
    let todoStatusId = todoStatus?.id;
    if (!todoStatusId) {
      todoStatusId = crypto.randomUUID();
      await taskStatusRepository.insert(db, {
        id: todoStatusId,
        name: "To Do",
        category: "TODO",
        position: 1,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const inProgressStatus = await taskStatusRepository.findByName(db, "In Progress");
    let inProgressStatusId = inProgressStatus?.id;
    if (!inProgressStatusId) {
      inProgressStatusId = crypto.randomUUID();
      await taskStatusRepository.insert(db, {
        id: inProgressStatusId,
        name: "In Progress",
        category: "IN_PROGRESS",
        position: 2,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      user: userId,
      project,
      todoStatusId,
      inProgressStatusId,
    };
  }

  async function createTask(params: {
    id: string;
    projectId: string;
    statusId: string;
    parentTaskId?: string | null;
    title: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string | null;
    slackThreadTs?: string | null;
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
        priority: params.priority ?? "MEDIUM",
        dueDate: params.dueDate ?? null,
        createdById: params.createdById,
        createdAt: params.now,
        updatedAt: params.now,
        statusChangedAt: params.now,
      }),
    ]);

    if (params.slackThreadTs) {
      await db.batch([taskRepository.updateSlackThreadTsStmt(db, params.id, params.slackThreadTs, params.now)]);
    }
  }

  it("FR-28 c1: posts status change into task thread when slack_thread_ts is present", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    const threadTs = "1731930000.000555";
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Threaded Task",
      createdById: user,
      slackThreadTs: threadTs,
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, ts: "1731930000.000666" }),
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);
    expect(outcome).toBe("DONE");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as { channel: string; thread_ts: string; text: string };
    expect(body.channel).toBe("C_THREAD_CHAN");
    expect(body.thread_ts).toBe(threadTs);
    expect(body.text).toBe("Status: To Do → In Progress by Alex Engineer");
  });

  it("FR-28 c1: posts exactly 'Status: <old> → <new> by <user>' and never the reject/reopen reason", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    const threadTs = "1731930000.000777";
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Rejected Task",
      createdById: user,
      slackThreadTs: threadTs,
      now,
    });

    const commentId = crypto.randomUUID();
    await db.batch([
      commentRepository.insertStmt(db, {
        id: commentId,
        taskId,
        authorId: user,
        parentCommentId: null,
        body: "Missing unit test coverage for edge case",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ]);

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
        reasonCommentId: commentId,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, ts: "1731930000.000888" }),
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);
    expect(outcome).toBe("DONE");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { channel: string; thread_ts: string; text: string };
    // Product decision (2026-11-19): the reason stays inside the project; Slack gets only FR-28 c1 text.
    expect(body.text).toBe("Status: To Do → In Progress by Alex Engineer");
    expect(body.text).not.toContain("Missing unit test coverage");
  });

  it("FR-28 c1 / security: escapes &, <, > in the actor name so it cannot ping a channel", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");
    const mallory = crypto.randomUUID();
    await userRepository.insert(db, {
      id: mallory,
      email: `mallory-${mallory}@example.com`,
      fullName: "<!here> & <https://evil.example|Mallory>",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Escaped Task",
      createdById: user,
      slackThreadTs: "1731930000.000999",
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({ taskId, fromStatusId: todoStatusId, toStatusId: inProgressStatusId, actorId: mallory }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, ts: "1731930000.001000" }),
    } as Response);

    const outcome = await processJob(createTestContext(now, { ...env, SLACK_BOT_TOKEN: "xoxb-mock-token" }), jobId);
    expect(outcome).toBe("DONE");
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { text: string };
    expect(body.text).toBe("Status: To Do → In Progress by &lt;!here&gt; &amp; &lt;https://evil.example|Mallory&gt;");
    expect(body.text).not.toContain("<!here>");
  });

  it("FR-28 c2: ordering after post: throws retryable error if slack_thread_ts is null and post job is PENDING", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    // No slackThreadTs set on task
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Pending Post Task",
      createdById: user,
      slackThreadTs: null,
      now,
    });

    // An outbox job exists for SLACK_POST_TASK in PENDING status
    const postJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: postJobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const threadJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: threadJobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, threadJobId);

    // Should fail and retry because original post has not run yet
    expect(outcome).toBe("FAILED");
    expect(fetchMock).not.toHaveBeenCalled();

    const job = await outboxJobRepository.findById(db, threadJobId);
    expect(job?.status).toBe("FAILED");
    expect(job?.lastError).toContain("Waiting for original post");
    expect(job?.attempts).toBe(1);
  });

  it("FR-28 c2: ordering after post: marks SKIPPED if slack_thread_ts is null and post job is DEAD", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Dead Post Task",
      createdById: user,
      slackThreadTs: null,
      now,
    });

    // Post job died
    const postJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: postJobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "DEAD",
      attempts: 5,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const threadJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: threadJobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, threadJobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FR-28 c2: ordering after post: marks SKIPPED if slack_thread_ts is null and post job was SKIPPED", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Skipped Post Task",
      createdById: user,
      slackThreadTs: null,
      now,
    });

    // Post job skipped
    const postJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: postJobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId }),
      status: "SKIPPED",
      attempts: 1,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const threadJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: threadJobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = {
      ...env,
      SLACK_BOT_TOKEN: "xoxb-mock-token",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, threadJobId);

    expect(outcome).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks SKIPPED without calling fetch if SLACK_BOT_TOKEN is missing or empty", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Empty Token Task",
      createdById: user,
      slackThreadTs: "1731930000.000999",
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
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

  it("marks SKIPPED without calling fetch if project has no slackChannelId", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject(null);

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "No Channel Task",
      createdById: user,
      slackThreadTs: "1731930000.000999",
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
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

  it("handles Slack API channel_not_found error by skipping with warning log", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_BAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "Bad Channel Task",
      createdById: user,
      slackThreadTs: "1731930000.000999",
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
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

  it("handles Slack HTTP >= 500 by throwing and failing the job", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const { user, project, todoStatusId, inProgressStatusId } = await ensureUserAndProject("C_THREAD_CHAN");

    const taskId = crypto.randomUUID();
    await createTask({
      id: taskId,
      projectId: project.id,
      statusId: inProgressStatusId,
      title: "500 Task",
      createdById: user,
      slackThreadTs: "1731930000.000999",
      now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: JSON.stringify({
        taskId,
        fromStatusId: todoStatusId,
        toStatusId: inProgressStatusId,
        actorId: user,
      }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const testEnv: Env = { ...env, SLACK_BOT_TOKEN: "xoxb-valid" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    } as Response);

    const ctx = createTestContext(now, testEnv);
    const outcome = await processJob(ctx, jobId);

    expect(outcome).toBe("FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("FAILED");
    expect(job?.attempts).toBe(1);
  });
});
