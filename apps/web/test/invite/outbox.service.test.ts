import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createDatabase, inviteRepository, outboxJobRepository, userRepository } from "@pm/db";
import { OUTBOX_MAX_ATTEMPTS } from "@pm/domain";

import {
  ConsoleEmailSender,
  dispatchOutbox,
  type JobContext,
  processJob,
  sweepOutbox,
} from "../../app/services/outbox.service";
import { sealInviteToken } from "../../app/utils/crypto.server";

describe("outbox.service", () => {
  const db = createDatabase(env.DB);

  function createTestContext(now: Date = new Date()): JobContext {
    return {
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
  }

  async function ensureAdminUser(): Promise<string> {
    const adminId = "outbox-admin-test-id";
    const existing = await userRepository.findById(db, adminId);
    if (!existing) {
      const now = new Date();
      await userRepository.insert(db, {
        id: adminId,
        email: "outbox-admin@example.com",
        fullName: "Outbox Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
    return adminId;
  }

  it("processes EMAIL_INVITE job, sends email, and sanitizes payload", async () => {
    const now = new Date();
    const adminId = await ensureAdminUser();
    const ctx = createTestContext(now);
    const inviteId = crypto.randomUUID();
    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const sealedToken = await sealInviteToken(rawToken, env.SESSION_SECRET);

    await inviteRepository.insert(db, {
      id: inviteId,
      email: "invite-test@example.com",
      tokenHash: "dummy-hash",
      userId: null,
      projectId: null,
      projectRole: null,
      invitedById: adminId,
      expiresAt: new Date(now.getTime() + 86400000),
      createdAt: now,
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_INVITE",
      payload: JSON.stringify({ inviteId, sealedToken }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    let sentTo = "";
    let sentUrl = "";
    // Save the real function: a wrapper calling ConsoleEmailSender.sendInvite would recurse forever after restore.
    const origSend = ConsoleEmailSender.sendInvite;
    ConsoleEmailSender.sendInvite = (to, url) => {
      sentTo = to;
      sentUrl = url;
    };

    try {
      const outcome = await processJob(ctx, jobId);
      expect(outcome).toBe("DONE");
      expect(sentTo).toBe("invite-test@example.com");
      expect(sentUrl).toContain(`/invite/${rawToken}`);

      const finishedJob = await outboxJobRepository.findById(db, jobId);
      expect(finishedJob?.status).toBe("DONE");
      // Sealed token cleared from payload!
      expect(finishedJob?.payload).toBe(JSON.stringify({ inviteId }));
    } finally {
      ConsoleEmailSender.sendInvite = origSend;
    }
  });

  async function queueInviteJob(now: Date) {
    const adminId = await ensureAdminUser();
    const inviteId = crypto.randomUUID();
    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await inviteRepository.insert(db, {
      id: inviteId,
      email: `redact-${inviteId}@example.com`,
      tokenHash: `hash-${inviteId}`,
      userId: null,
      projectId: null,
      projectRole: null,
      invitedById: adminId,
      expiresAt: new Date(now.getTime() + 86400000),
      createdAt: now,
    });
    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_INVITE",
      payload: JSON.stringify({ inviteId, sealedToken: await sealInviteToken(rawToken, env.SESSION_SECRET) }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { jobId, rawToken };
  }

  it("FR-37 c4 / security: outside local, the invite email is sent through the EmailSender port with the link redacted in logs", async () => {
    const now = new Date();
    const { jobId, rawToken } = await queueInviteJob(now);
    const sent: { url: string; redactLink: boolean | undefined }[] = [];
    const ctx: JobContext = {
      ...createTestContext(now),
      env: { ...env, APP_ENV: "production" },
      emailSender: {
        sendInvite: (_to, url, _project, options) => {
          sent.push({ url, redactLink: options?.redactLink });
        },
        sendDeadlineReminder: () => {},
      },
    };

    expect(await processJob(ctx, jobId)).toBe("DONE");
    // The real link still reaches the sender (a real provider must deliver it)...
    expect(sent).toEqual([{ url: expect.stringContaining(`/invite/${rawToken}`) as string, redactLink: true }]);
  });

  it("FR-37 c4: the console sender logs the rendered invite with only the token's last 4 characters", async () => {
    const logSpy = vi.spyOn(console, "log");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    await ConsoleEmailSender.sendInvite("someone@example.com", `https://pm.example.com/invite/${token}`, undefined, {
      redactLink: true,
    });
    const logged = logSpy.mock.calls.map(([line]) => String(line)).join(" ");
    logSpy.mockRestore();
    expect(logged).toContain(`Set your password: https://pm.example.com/invite/…${token.slice(-4)}`);
    expect(logged).not.toContain(token);
  });

  it("skips expired or already accepted invites", async () => {
    const now = new Date();
    const adminId = await ensureAdminUser();
    const ctx = createTestContext(now);
    const inviteId = crypto.randomUUID();

    // Expired invite
    await inviteRepository.insert(db, {
      id: inviteId,
      email: "expired@example.com",
      tokenHash: "hash-expired",
      userId: null,
      projectId: null,
      projectRole: null,
      invitedById: adminId,
      expiresAt: new Date(now.getTime() - 1000),
      createdAt: new Date(now.getTime() - 86400000),
    });

    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_INVITE",
      payload: JSON.stringify({ inviteId, sealedToken: "some:token" }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const outcome = await processJob(ctx, jobId);
    expect(outcome).toBe("SKIPPED");

    const job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("SKIPPED");
  });

  it("retries failed jobs with exponential backoff and marks dead after max attempts", async () => {
    const now = new Date();
    const adminId = await ensureAdminUser();
    const ctx = createTestContext(now);
    const inviteId = crypto.randomUUID();

    await inviteRepository.insert(db, {
      id: inviteId,
      email: "retry@example.com",
      tokenHash: "hash-retry",
      userId: null,
      projectId: null,
      projectRole: null,
      invitedById: adminId,
      expiresAt: new Date(now.getTime() + 86400000),
      createdAt: now,
    });

    // Corrupt sealed token causes handler to throw
    const jobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_INVITE",
      payload: JSON.stringify({ inviteId, sealedToken: "bad:token" }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 1st attempt
    const res1 = await processJob(ctx, jobId);
    expect(res1).toBe("FAILED");
    let job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("FAILED");
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toBeDefined();

    // Set attempts to 4 to test reaching DEAD
    await db.batch([outboxJobRepository.failStmt(db, jobId, now, OUTBOX_MAX_ATTEMPTS - 1, "Simulated attempt 4", now)]);

    // Final attempt reaches OUTBOX_MAX_ATTEMPTS
    const resFinal = await processJob(ctx, jobId);
    expect(resFinal).toBe("DEAD");
    job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("DEAD");
    expect(job?.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it("sweepOutbox recovers stuck jobs and runs due jobs", async () => {
    const now = new Date();
    const tenMinsAgo = new Date(now.getTime() - 11 * 60 * 1000);

    // Stuck job stuck in RUNNING for >10 mins
    const stuckJobId = crypto.randomUUID();
    await outboxJobRepository.insert(db, {
      id: stuckJobId,
      type: "SLACK_POST_TASK",
      payload: JSON.stringify({ test: true }),
      status: "RUNNING",
      attempts: 1,
      nextAttemptAt: tenMinsAgo,
      createdAt: tenMinsAgo,
      updatedAt: tenMinsAgo,
    });

    const result = await sweepOutbox(env, now);
    expect(result.claimed).toBeGreaterThanOrEqual(1);

    const recovered = await outboxJobRepository.findById(db, stuckJobId);
    // Was recovered to PENDING, then executed (SLACK_POST_TASK returns SKIPPED)
    expect(recovered?.status).toBe("SKIPPED");
  });

  it("dispatchOutbox executes given jobs", async () => {
    const now = new Date();
    const ctx = createTestContext(now);
    const jobId = crypto.randomUUID();

    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_UPDATE_THREAD",
      payload: "{}",
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await dispatchOutbox(ctx, [jobId]);
    const job = await outboxJobRepository.findById(db, jobId);
    expect(job?.status).toBe("SKIPPED");
  });
});
