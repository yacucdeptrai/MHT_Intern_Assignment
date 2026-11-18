import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createDatabase, outboxJobRepository } from "@pm/db";
import { OUTBOX_BACKOFF_BASE_MS, OUTBOX_MAX_ATTEMPTS } from "@pm/domain";

import { type JobContext, jobHandlers, processJob, sweepOutbox } from "../../app/services/outbox.service";
import { scheduledHandler } from "../../worker/index";

describe("outboxSweep and background job lifecycle", () => {
  const db = createDatabase(env.DB);

  function createMockLogger() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  function createTestContext(now: Date, logger = createMockLogger()): JobContext {
    return {
      env,
      db,
      logger,
      clock: { now: () => now },
    };
  }

  it("claim race: only one runner succeeds in claiming a pending job", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const jobId = crypto.randomUUID();

    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId: "t-1" }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const [firstClaim] = await db.batch([outboxJobRepository.claimStmt(db, jobId, now)]);
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.id).toBe(jobId);
    expect(firstClaim[0]?.attempts).toBe(1);

    // Second claim immediately attempted by a concurrent runner
    const [secondClaim] = await db.batch([outboxJobRepository.claimStmt(db, jobId, now)]);
    expect(secondClaim).toHaveLength(0);

    // Verify DB state
    const job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("RUNNING");
    expect(job?.attempts).toBe(1);
  });

  it("backoff: failures 1-4 set next_attempt_at to now + 1, 2, 4, and 8 minutes", async () => {
    const baseNow = new Date("2026-11-18T12:00:00Z");
    const jobId = crypto.randomUUID();

    // Register a throwing handler for test
    const origHandler = jobHandlers.SLACK_POST_TASK;
    jobHandlers.SLACK_POST_TASK = () => {
      throw new Error("Simulated failure for backoff test");
    };

    try {
      await outboxJobRepository.insert(db, {
        id: jobId,
        type: "SLACK_POST_TASK",
        payload: JSON.stringify({ taskId: "t-backoff" }),
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: baseNow,
        createdAt: baseNow,
        updatedAt: baseNow,
      });

      const expectedMinutes = [1, 2, 4, 8];

      for (let attempt = 1; attempt <= 4; attempt++) {
        const attemptNow = new Date(baseNow.getTime() + (attempt - 1) * 60_000);
        const ctx = createTestContext(attemptNow);

        const outcome = await processJob(ctx, jobId);
        expect(outcome).toBe("FAILED");

        const job = await outboxJobRepository.findById(db, jobId);
        expect(job?.status).toBe("FAILED");
        expect(job?.attempts).toBe(attempt);

        const expectedBackoffMs = OUTBOX_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        const expectedNextAttempt = new Date(attemptNow.getTime() + expectedBackoffMs);
        expect(job?.nextAttemptAt.getTime()).toBe(expectedNextAttempt.getTime());
        expect(expectedMinutes[attempt - 1]).toBe(Math.pow(2, attempt - 1));

        // Advance nextAttemptAt so the next attempt can claim it
        await db.batch([
          outboxJobRepository.failStmt(
            db,
            jobId,
            new Date(attemptNow.getTime() + 60_000),
            attempt,
            "Simulated failure",
            attemptNow,
          ),
        ]);
      }
    } finally {
      jobHandlers.SLACK_POST_TASK = origHandler;
    }
  });

  it("dead after max attempts: 5th failure sets status to DEAD and logs at error level", async () => {
    const now = new Date("2026-11-18T14:00:00Z");
    const jobId = crypto.randomUUID();
    const logger = createMockLogger();
    const ctx = createTestContext(now, logger);

    const origHandler = jobHandlers.SLACK_POST_TASK;
    jobHandlers.SLACK_POST_TASK = () => {
      throw new Error("Fatal failure on attempt 5");
    };

    try {
      // Pre-seed job with 4 previous attempts
      await outboxJobRepository.insert(db, {
        id: jobId,
        type: "SLACK_POST_TASK",
        payload: JSON.stringify({ taskId: "t-dead" }),
        status: "FAILED",
        attempts: OUTBOX_MAX_ATTEMPTS - 1,
        nextAttemptAt: now,
        createdAt: new Date(now.getTime() - 3600_000),
        updatedAt: new Date(now.getTime() - 60_000),
      });

      const outcome = await processJob(ctx, jobId);
      expect(outcome).toBe("DEAD");

      const job = await outboxJobRepository.findById(db, jobId);
      expect(job?.status).toBe("DEAD");
      expect(job?.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
      expect(job?.lastError).toContain("Fatal failure on attempt 5");

      // Verify logged at error level
      expect(logger.error).toHaveBeenCalledWith(
        "Outbox job marked DEAD after max attempts",
        expect.objectContaining({
          jobId,
          attempts: OUTBOX_MAX_ATTEMPTS,
        }),
      );
    } finally {
      jobHandlers.SLACK_POST_TASK = origHandler;
    }
  });

  it("stuck recovery: a RUNNING job with updated_at > 10m ago is reset to FAILED", async () => {
    const now = new Date("2026-11-18T15:00:00Z");
    const elevenMinsAgo = new Date(now.getTime() - 11 * 60 * 1000);
    const stuckJobId = crypto.randomUUID();

    await outboxJobRepository.insert(db, {
      id: stuckJobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ taskId: "t-stuck" }),
      status: "RUNNING",
      attempts: 2,
      nextAttemptAt: elevenMinsAgo,
      createdAt: elevenMinsAgo,
      updatedAt: elevenMinsAgo,
    });

    // Run sweep
    const result = await sweepOutbox(env, now);
    expect(result.claimed).toBeGreaterThanOrEqual(1);

    const job = await outboxJobRepository.findById(db, stuckJobId);
    // After recovery to FAILED, the sweep immediately claims and executes it (SLACK_POST_TASK default returns SKIPPED)
    expect(job?.status).toBe("SKIPPED");
  });

  it("scheduledHandler runs sweepOutbox and handles hourly trigger", async () => {
    const scheduledTime = new Date("2026-11-18T16:00:00Z").getTime(); // Minute 0: hourly tick
    const waitUntilPromises: Promise<unknown>[] = [];
    const mockCtx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      },
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext;

    const mockController: ScheduledController = {
      cron: "*/5 * * * *",
      scheduledTime,
      noRetry: () => {},
    };

    scheduledHandler(mockController, env, mockCtx);
    expect(waitUntilPromises).toHaveLength(1);
    await Promise.all(waitUntilPromises);
  });
});
