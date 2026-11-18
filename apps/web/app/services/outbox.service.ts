import {
  createDatabase,
  inviteRepository,
  outboxJobRepository,
  projectRepository,
  taskRepository,
  type OutboxJob,
} from "@pm/db";
import {
  EmailInvitePayloadSchema,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_SWEEP_LIMIT,
  SlackPostTaskPayloadSchema,
  type OutboxJobType,
} from "@pm/domain";

import { unsealInviteToken } from "../utils/crypto.server";
import { createLogger, type Logger } from "../utils/logger.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface JobContext {
  env: Env;
  db: ReturnType<typeof createDatabase>;
  logger: Logger;
  clock: { now: () => Date };
}

export interface SweepResult {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
  skipped: number;
}

export const ConsoleEmailSender = {
  sendInvite: (_to: string, _inviteUrl: string, _projectName?: string): void => {
    // Mock email sender: records in logger / console
    // Never reveals sensitive tokens in external logs
  },
};

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

  ConsoleEmailSender.sendInvite(invite.email, inviteUrl);
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

  // Sub-tasks are not posted (FR-27 criterion 3)
  if (task.parentTaskId !== null) {
    return "SKIPPED";
  }

  // Idempotency: if already posted, return DONE without re-posting (FR-27 criterion 4)
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

  // Format message text: *<CODE>-<number>* <title> · Priority: <priority> · Due: <dueDate or "none"> · <APP_BASE_URL>/projects/<projectId>/tasks/<taskId>
  const appBaseUrl = ctx.env.APP_BASE_URL.replace(/\/+$/, "");
  const taskUrl = `${appBaseUrl}/projects/${project.id}/tasks/${task.id}`;
  const dueText = task.dueDate || "none";
  const messageText = `*${project.code}-${task.number}* ${task.title} · Priority: ${task.priority} · Due: ${dueText} · ${taskUrl}`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: project.slackChannelId,
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
        channel: project.slackChannelId,
        slackError: data.error,
      });
      return "SKIPPED";
    }
    throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
  }

  if (data.ts) {
    const now = ctx.clock.now();
    await ctx.db.batch([taskRepository.updateSlackThreadTsStmt(ctx.db, task.id, data.ts, now)]);
  }

  return "DONE";
}

export const jobHandlers: Record<OutboxJobType, JobHandler> = {
  EMAIL_INVITE: handleInviteEmail,
  SLACK_POST_TASK: handleSlackPostTask,
  SLACK_UPDATE_THREAD: () => Promise.resolve("SKIPPED"),
  EMAIL_DEADLINE_REMINDER: () => Promise.resolve("SKIPPED"),
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
