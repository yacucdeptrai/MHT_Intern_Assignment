import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { conflictGuardStmt } from "../src/batch";
import { createDatabase } from "../src/client";
import { inviteRepository, outboxJobRepository, userRepository } from "../src/index";

describe("Outbox and Invite repositories", () => {
  it("inserts, finds, claims, and finishes an outbox job", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const jobId = crypto.randomUUID();

    const created = await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_INVITE",
      payload: JSON.stringify({ inviteId: "inv-1" }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(created.id).toBe(jobId);
    expect(created.status).toBe("PENDING");

    // Claim
    await db.batch([outboxJobRepository.claimStmt(db, jobId, now)]);
    const claimed = await outboxJobRepository.findById(db, jobId);
    expect(claimed?.status).toBe("RUNNING");
    expect(claimed?.attempts).toBe(1);

    // Finish as DONE
    await db.batch([outboxJobRepository.finishStmt(db, jobId, "DONE", now, JSON.stringify({ inviteId: "inv-1" }))]);
    const finished = await outboxJobRepository.findById(db, jobId);
    expect(finished?.status).toBe("DONE");
  });

  it("handles failStmt with retry backoff and dead-letter on 5th attempt", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const jobId = crypto.randomUUID();

    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "EMAIL_DEADLINE_REMINDER",
      payload: "{}",
      status: "RUNNING",
      attempts: 1,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Fail attempt 1 -> FAILED
    const retryTime = new Date(now.getTime() + 60000);
    await db.batch([outboxJobRepository.failStmt(db, jobId, retryTime, 1, "Connection error", now)]);
    const failedJob = await outboxJobRepository.findById(db, jobId);
    expect(failedJob?.status).toBe("FAILED");
    expect(failedJob?.lastError).toBe("Connection error");

    // Fail attempt 5 -> DEAD
    await db.batch([outboxJobRepository.failStmt(db, jobId, retryTime, 5, "Permanent failure", now)]);
    const deadJob = await outboxJobRepository.findById(db, jobId);
    expect(deadJob?.status).toBe("DEAD");
  });

  it("recovers stuck jobs and lists due jobs", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const stuckTime = new Date(now.getTime() - 15 * 60 * 1000); // 15 mins ago
    const jobId = crypto.randomUUID();

    await outboxJobRepository.insert(db, {
      id: jobId,
      type: "SLACK_POST_TASK",
      payload: "{}",
      status: "RUNNING",
      attempts: 1,
      nextAttemptAt: now,
      createdAt: stuckTime,
      updatedAt: stuckTime,
    });

    const threshold = new Date(now.getTime() - 10 * 60 * 1000); // 10 mins threshold
    await db.batch([outboxJobRepository.recoverStuckStmt(db, threshold, now)]);

    const recovered = await outboxJobRepository.findById(db, jobId);
    expect(recovered?.status).toBe("FAILED");

    // List due
    const due = await outboxJobRepository.listDue(db, now, 10);
    expect(due.some((j) => j.id === jobId)).toBe(true);
  });

  it("accepts invite with acceptStmt and blocks double acceptance via conflict guard", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const admin = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "invite-tester@example.com",
      fullName: "Invite Tester",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const inviteId = crypto.randomUUID();
    await inviteRepository.insert(db, {
      id: inviteId,
      email: "target-invite@example.com",
      tokenHash: "token-hash-xyz",
      userId: admin.id,
      projectId: null,
      projectRole: null,
      invitedById: admin.id,
      expiresAt: new Date(now.getTime() + 100000),
      createdAt: now,
    });

    // First acceptance succeeds
    await db.batch([inviteRepository.acceptStmt(db, inviteId, now), conflictGuardStmt(db)]);
    const accepted = await inviteRepository.findById(db, inviteId);
    expect(accepted?.acceptedAt).toBeDefined();

    // Second acceptance touches 0 rows and is rejected by conflictGuardStmt
    await expect(db.batch([inviteRepository.acceptStmt(db, inviteId, now), conflictGuardStmt(db)])).rejects.toThrow();
  });
});
