import { createDatabase, inviteRepository, outboxJobRepository, type OutboxJob } from "@pm/db";
import {
  EmailInvitePayloadSchema,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_SWEEP_LIMIT,
  type OutboxJobType,
} from "@pm/domain";

import { unsealInviteToken } from "../utils/crypto.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface JobContext {
  env: Env;
  db: ReturnType<typeof createDatabase>;
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
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

export const jobHandlers: Record<OutboxJobType, JobHandler> = {
  EMAIL_INVITE: handleInviteEmail,
  SLACK_POST_TASK: () => Promise.resolve("SKIPPED"),
  SLACK_UPDATE_THREAD: () => Promise.resolve("SKIPPED"),
  EMAIL_DEADLINE_REMINDER: () => Promise.resolve("SKIPPED"),
};

export async function processJob(ctx: JobContext, jobId: string): Promise<"DONE" | "FAILED" | "DEAD" | "SKIPPED"> {
  const now = ctx.clock.now();
  const job = await outboxJobRepository.findById(ctx.db, jobId);
  if (!job) {
    return "SKIPPED";
  }

  const [claimedRows] = await ctx.db.batch([outboxJobRepository.claimStmt(ctx.db, jobId, now)]);
  // If no row was updated, another runner claimed it or it is not due
  if (claimedRows.length === 0) {
    return "SKIPPED";
  }

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
    const nextAttempts = job.attempts + 1;
    const isDead = nextAttempts >= OUTBOX_MAX_ATTEMPTS;
    const backoffMs = OUTBOX_BACKOFF_BASE_MS * Math.pow(2, job.attempts);
    const nextAttemptAt = new Date(now.getTime() + backoffMs);

    await ctx.db.batch([outboxJobRepository.failStmt(ctx.db, jobId, nextAttemptAt, nextAttempts, errorMsg, now)]);
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
  const ctx: JobContext = {
    env,
    db,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
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
    sweepResult.claimed++;
    const outcome = await processJob(ctx, job.id);
    if (outcome === "DONE") sweepResult.done++;
    else if (outcome === "FAILED") sweepResult.failed++;
    else if (outcome === "DEAD") sweepResult.dead++;
    else sweepResult.skipped++;
  }

  return sweepResult;
}
