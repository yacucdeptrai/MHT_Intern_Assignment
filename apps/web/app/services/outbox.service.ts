import {
  createDatabase,
  inviteRepository,
  outboxJobRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
  type OutboxJob,
} from "@pm/db";
import {
  EmailDeadlineReminderPayloadSchema,
  EmailInvitePayloadSchema,
  escapeSlackText,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_SWEEP_LIMIT,
  SlackPostTaskPayloadSchema,
  SlackUpdateThreadPayloadSchema,
  type OutboxJobType,
} from "@pm/domain";

import { unsealInviteToken } from "../utils/crypto.server";
import { createEmailSender, type EmailSender } from "./email/emailSender";
import { deadlineReminderSubject } from "./email/templates";
import { createLogger, type Logger } from "../utils/logger.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface JobContext {
  env: Env;
  db: ReturnType<typeof createDatabase>;
  logger: Logger;
  clock: { now: () => Date };
  /** Defaults to the sender chosen by `EMAIL_PROVIDER` (createEmailSender). */
  emailSender?: EmailSender;
}

function emailSenderFor(ctx: JobContext): EmailSender {
  return ctx.emailSender ?? createEmailSender(ctx.env, ctx.logger);
}

export interface SweepResult {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
  skipped: number;
}

export { ConsoleEmailSender, createEmailSender } from "./email/emailSender";
export type { DeadlineReminderEmailInput, EmailSender } from "./email/emailSender";

export type JobHandler = (ctx: JobContext, job: OutboxJob) => Promise<"DONE" | "SKIPPED">;

async function handleInviteEmail(ctx: JobContext, job: OutboxJob): Promise<"DONE" | "SKIPPED"> {
  const parsed = EmailInvitePayloadSchema.safeParse(JSON.parse(job.payload));
  if (!parsed.success) {
    return "SKIPPED";
  }

  const invite = await inviteRepository.findById(ctx.db, parsed.data.inviteId);
  const now = ctx.clock.now();

  // If invite is not found, already accepted, or expired, skip
  if (!invite || invite.acceptedAt !== null || invite.expiresAt <= now) {
    return "SKIPPED";
  }

  if (!parsed.data.sealedToken) {
    return "SKIPPED";
  }

  const rawToken = await unsealInviteToken(parsed.data.sealedToken, ctx.env.SESSION_SECRET);
  const inviteUrl = `${ctx.env.APP_BASE_URL.replace(/\/+$/, "")}/invite/${rawToken}`;

  // The URL carries a one-time token; it is only logged in full during local development.
  await emailSenderFor(ctx).sendInvite(invite.email, inviteUrl, undefined, {
    redactLink: ctx.env.APP_ENV !== "local",
  });
  return "DONE";
}

async function handleSlackPostTask(ctx: JobContext, job: OutboxJob): Promise<"DONE" | "SKIPPED"> {
  const parsed = SlackPostTaskPayloadSchema.safeParse(JSON.parse(job.payload));
  if (!parsed.success) {
    return "SKIPPED";
  }

  const task = await taskRepository.findById(ctx.db, parsed.data.taskId);
  if (!task || task.deletedAt !== null) {
    return "SKIPPED";
  }

  // Sub-tasks are not posted; only top-level tasks get a Slack thread (FR-27)
  if (task.parentTaskId !== null) {
    return "SKIPPED";
  }

  // Idempotency: if already posted, return DONE without re-posting (docs/09 §3.4)
  if (task.slackThreadTs) {
    return "DONE";
  }

  // If Slack is not configured, return SKIPPED without making an external request (FR-27 criterion 2)
  if (!ctx.env.SLACK_BOT_TOKEN || ctx.env.SLACK_BOT_TOKEN.trim() === "") {
    return "SKIPPED";
  }

  const project = await projectRepository.findById(ctx.db, task.projectId);
  if (!project || !project.slackChannelId || project.slackChannelId.trim() === "") {
    return "SKIPPED";
  }

  const posted = await postTaskRootMessage(ctx, job, task, project, project.slackChannelId);
  return posted === null ? "SKIPPED" : "DONE";
}

type SlackTask = NonNullable<Awaited<ReturnType<typeof taskRepository.findById>>>;
type SlackProject = NonNullable<Awaited<ReturnType<typeof projectRepository.findById>>>;

/**
 * Posts the task's root message to the project channel and stores its `ts` as the thread.
 * Returns the thread ts, or null (job SKIPPED) when Slack reports the channel is unusable.
 */
async function postTaskRootMessage(
  ctx: JobContext,
  job: OutboxJob,
  task: SlackTask,
  project: SlackProject,
  channelId: string,
): Promise<string | null> {
  // Format message text: *<CODE>-<number>* <title> · Priority: <priority> · Due: <dueDate or "none"> · <APP_BASE_URL>/projects/<projectId>/tasks/<taskId>
  const appBaseUrl = ctx.env.APP_BASE_URL.replace(/\/+$/, "");
  const taskUrl = `${appBaseUrl}/projects/${project.id}/tasks/${task.id}`;
  const dueText = task.dueDate || "none";
  // The title is escaped so it cannot ping a channel or inject a link (Slack mrkdwn).
  const messageText = `*${project.code}-${task.number}* ${escapeSlackText(task.title)} · Priority: ${task.priority} · Due: ${dueText} · ${taskUrl}`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: channelId,
      text: messageText,
    }),
  });

  if (!res.ok) {
    throw new Error(`Slack chat.postMessage failed with HTTP ${res.status}`);
  }

  const data = await res.json<{ ok: boolean; ts?: string; error?: string }>();
  if (!data.ok) {
    if (data.error === "channel_not_found" || data.error === "not_in_channel") {
      ctx.logger.warn(`Slack post skipped: ${data.error}`, {
        jobId: job.id,
        taskId: task.id,
        channel: channelId,
        slackError: data.error,
      });
      return null;
    }
    throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
  }

  if (!data.ts) {
    throw new Error("Slack chat.postMessage returned no ts");
  }
  await ctx.db.batch([taskRepository.updateSlackThreadTsStmt(ctx.db, task.id, data.ts, ctx.clock.now())]);
  return data.ts;
}

async function handleSlackUpdateThread(ctx: JobContext, job: OutboxJob): Promise<"DONE" | "SKIPPED"> {
  const parsed = SlackUpdateThreadPayloadSchema.safeParse(JSON.parse(job.payload));
  if (!parsed.success) {
    return "SKIPPED";
  }

  const task = await taskRepository.findById(ctx.db, parsed.data.taskId);
  if (!task || task.deletedAt !== null) {
    return "SKIPPED";
  }

  // If Slack is not configured, return SKIPPED without making an external request
  if (!ctx.env.SLACK_BOT_TOKEN || ctx.env.SLACK_BOT_TOKEN.trim() === "") {
    return "SKIPPED";
  }

  const project = await projectRepository.findById(ctx.db, task.projectId);
  if (!project || !project.slackChannelId || project.slackChannelId.trim() === "") {
    return "SKIPPED";
  }

  // Determine thread_ts (ordering after post, FR-28 criterion 2)
  let threadTs = task.slackThreadTs;
  if (!threadTs) {
    // Sub-tasks never get a thread of their own (FR-27).
    if (task.parentTaskId !== null) {
      return "SKIPPED";
    }
    const postJob = await outboxJobRepository.findSlackPostTaskJob(ctx.db, task.id);
    if (postJob && (postJob.status === "PENDING" || postJob.status === "RUNNING" || postJob.status === "FAILED")) {
      // The original post is still on its way: retry so this update lands in its thread.
      throw new Error("Waiting for original post");
    }
    if (postJob?.status === "DEAD") {
      return "SKIPPED";
    }
    // The task was created before the project had a channel (post SKIPPED) or before Slack was
    // set up at all (no post job). Start its thread now. Only the oldest open update job does
    // this, so several quick status changes cannot post the root message twice.
    const oldest = await outboxJobRepository.findOldestOpenSlackUpdateJob(ctx.db, task.id);
    if (oldest && oldest.id !== job.id) {
      throw new Error("Waiting for original post");
    }
    const posted = await postTaskRootMessage(ctx, job, task, project, project.slackChannelId);
    if (posted === null) {
      return "SKIPPED";
    }
    threadTs = (await taskRepository.findById(ctx.db, task.id))?.slackThreadTs ?? posted;
  }

  // Look up status names
  const [fromStatus, toStatus] = await Promise.all([
    taskStatusRepository.findById(ctx.db, parsed.data.fromStatusId),
    taskStatusRepository.findById(ctx.db, parsed.data.toStatusId),
  ]);
  const fromName = fromStatus?.name ?? "Unknown";
  const toName = toStatus?.name ?? "Unknown";

  // Look up actor name
  const actor = await userRepository.findById(ctx.db, parsed.data.actorId);
  const actorName = actor?.fullName ?? "Unknown";

  // FR-28 c1, exactly. The reject/reopen reason is never sent: it stays inside the project.
  // Status and user names are user-controlled, so they are escaped for Slack mrkdwn.
  const messageText = `Status: ${escapeSlackText(fromName)} → ${escapeSlackText(toName)} by ${escapeSlackText(actorName)}`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: project.slackChannelId,
      thread_ts: threadTs,
      text: messageText,
    }),
  });

  if (!res.ok) {
    throw new Error(`Slack chat.postMessage failed with HTTP ${res.status}`);
  }

  const data = await res.json<{ ok: boolean; error?: string }>();
  if (!data.ok) {
    if (data.error === "channel_not_found" || data.error === "not_in_channel") {
      ctx.logger.warn(`Slack thread update skipped: ${data.error}`, {
        jobId: job.id,
        taskId: task.id,
        channel: project.slackChannelId,
        slackError: data.error,
      });
      return "SKIPPED";
    }
    throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
  }

  return "DONE";
}

async function handleDeadlineEmail(ctx: JobContext, job: OutboxJob): Promise<"DONE" | "SKIPPED"> {
  const parsed = EmailDeadlineReminderPayloadSchema.safeParse(JSON.parse(job.payload));
  if (!parsed.success) {
    return "SKIPPED";
  }

  const { taskId, userId, kind, dueDate } = parsed.data;

  const task = await taskRepository.findById(ctx.db, taskId);
  if (!task || task.deletedAt !== null) {
    return "SKIPPED";
  }

  // The due date changed after this reminder was queued: the scan queues a new reminder for the
  // new date (FR-29 c3), so this one is stale and must not be sent.
  if (task.dueDate !== dueDate) {
    return "SKIPPED";
  }

  // Archived projects get no reminders, even for jobs queued before archiving.
  const project = await projectRepository.findById(ctx.db, task.projectId);
  if (!project) {
    return "SKIPPED";
  }

  const status = await taskStatusRepository.findById(ctx.db, task.statusId);
  if (!status || status.category === "DONE") {
    return "SKIPPED";
  }

  const user = await userRepository.findById(ctx.db, userId);
  if (!user || user.deletedAt !== null || user.status !== "ACTIVE" || !user.email) {
    return "SKIPPED";
  }

  const assignees = await taskAssigneeRepository.findUserIdsByTaskId(ctx.db, task.id);
  if (!assignees.includes(user.id)) {
    return "SKIPPED";
  }

  const subject = deadlineReminderSubject(kind, task.title);
  const taskUrl = `${ctx.env.APP_BASE_URL.replace(/\/+$/, "")}/projects/${task.projectId}/tasks/${task.id}`;

  await emailSenderFor(ctx).sendDeadlineReminder({
    to: user.email,
    subject,
    kind,
    taskTitle: task.title,
    projectName: project.name,
    dueDate,
    taskUrl,
    idempotencyKey: job.id,
  });

  ctx.logger.info("Deadline reminder sent", {
    kind,
    taskId: task.id,
    userId: user.id,
    idempotencyKey: job.id,
  });

  return "DONE";
}

export const jobHandlers: Record<OutboxJobType, JobHandler> = {
  EMAIL_INVITE: handleInviteEmail,
  SLACK_POST_TASK: handleSlackPostTask,
  SLACK_UPDATE_THREAD: handleSlackUpdateThread,
  EMAIL_DEADLINE_REMINDER: handleDeadlineEmail,
};

export async function processJob(
  ctx: JobContext,
  jobId: string,
): Promise<"DONE" | "FAILED" | "DEAD" | "SKIPPED" | null> {
  const now = ctx.clock.now();
  const job = await outboxJobRepository.findById(ctx.db, jobId);
  if (!job) {
    return "SKIPPED";
  }

  const [claimedRows] = await ctx.db.batch([outboxJobRepository.claimStmt(ctx.db, jobId, now)]);
  // If no row was updated, another runner claimed it or it is not due
  const claimedJob = claimedRows[0];
  if (!claimedJob) {
    return null;
  }

  const attempts = claimedJob.attempts;
  const handler = jobHandlers[job.type];

  try {
    const outcome = await handler(ctx, job);
    // When done/skipped, overwrite payload with { inviteId } to clear sealedToken
    let sanitizedPayload: string | undefined;
    try {
      const p = JSON.parse(job.payload) as { inviteId?: string };
      if (p.inviteId) {
        sanitizedPayload = JSON.stringify({ inviteId: p.inviteId });
      }
    } catch {
      // Ignore parse error
    }

    await ctx.db.batch([outboxJobRepository.finishStmt(ctx.db, jobId, outcome, now, sanitizedPayload)]);
    return outcome;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isDead = attempts >= OUTBOX_MAX_ATTEMPTS;
    const backoffMs = OUTBOX_BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
    const nextAttemptAt = new Date(now.getTime() + backoffMs);

    if (isDead) {
      ctx.logger.error("Outbox job marked DEAD after max attempts", {
        jobId,
        jobType: job.type,
        attempts,
        error: err instanceof Error ? err : { name: "Error", message: errorMsg },
      });
    }

    await ctx.db.batch([outboxJobRepository.failStmt(ctx.db, jobId, nextAttemptAt, attempts, errorMsg, now)]);
    return isDead ? "DEAD" : "FAILED";
  }
}

export async function dispatchOutbox(ctx: RequestContext | JobContext, jobIds: string[]): Promise<void> {
  const jobCtx: JobContext = {
    env: ctx.env,
    db: ctx.db,
    logger: ctx.logger,
    clock: ctx.clock,
  };

  for (const jobId of jobIds) {
    try {
      await processJob(jobCtx, jobId);
    } catch (err: unknown) {
      ctx.logger.error("Failed to dispatch outbox job", {
        jobId,
        error: err instanceof Error ? err : undefined,
      });
    }
  }
}

export async function sweepOutbox(env: Env, now: Date): Promise<SweepResult> {
  const db = createDatabase(env.DB);
  const logger = createLogger("outbox-sweep");
  const ctx: JobContext = {
    env,
    db,
    logger,
    clock: { now: () => now },
  };

  const sweepResult: SweepResult = {
    claimed: 0,
    done: 0,
    failed: 0,
    dead: 0,
    skipped: 0,
  };

  // 1. Recover stuck jobs (>10m in RUNNING state)
  const stuckThreshold = new Date(now.getTime() - 10 * 60 * 1000);
  await db.batch([outboxJobRepository.recoverStuckStmt(db, stuckThreshold, now)]);

  // 2. Query and process due jobs up to limit
  const dueJobs = await outboxJobRepository.listDue(db, now, OUTBOX_SWEEP_LIMIT);
  for (const job of dueJobs) {
    const outcome = await processJob(ctx, job.id);
    if (outcome === null) {
      continue;
    }
    sweepResult.claimed++;
    if (outcome === "DONE") sweepResult.done++;
    else if (outcome === "FAILED") sweepResult.failed++;
    else if (outcome === "DEAD") sweepResult.dead++;
    else sweepResult.skipped++;
  }

  return sweepResult;
}
