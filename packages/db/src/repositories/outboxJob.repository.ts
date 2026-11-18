import { and, asc, eq, inArray, lte, lt, sql } from "drizzle-orm";

import { OUTBOX_MAX_ATTEMPTS } from "@pm/domain";

import type { AppDatabase } from "../client";
import { outboxJobs, type NewOutboxJob, type OutboxJob } from "../schema/outboxJobs";

export const outboxJobRepository = {
  insertStmt(db: AppDatabase, job: NewOutboxJob) {
    return db.insert(outboxJobs).values(job);
  },

  async insert(db: AppDatabase, job: NewOutboxJob): Promise<OutboxJob> {
    const [created] = await db.insert(outboxJobs).values(job).returning();
    if (!created) {
      throw new Error("Failed to insert outbox job");
    }
    return created;
  },

  async findById(db: AppDatabase, id: string): Promise<OutboxJob | null> {
    const [job] = await db.select().from(outboxJobs).where(eq(outboxJobs.id, id)).limit(1);
    return job ?? null;
  },

  claimStmt(db: AppDatabase, id: string, now: Date) {
    return db
      .update(outboxJobs)
      .set({
        status: "RUNNING",
        attempts: sql`${outboxJobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxJobs.id, id),
          inArray(outboxJobs.status, ["PENDING", "FAILED"]),
          lte(outboxJobs.nextAttemptAt, now),
        ),
      )
      .returning({ id: outboxJobs.id, attempts: outboxJobs.attempts });
  },

  finishStmt(db: AppDatabase, id: string, status: "DONE" | "SKIPPED", now: Date, payload?: string) {
    const updateData: Partial<NewOutboxJob> = {
      status,
      updatedAt: now,
    };
    if (payload !== undefined) {
      updateData.payload = payload;
    }
    return db.update(outboxJobs).set(updateData).where(eq(outboxJobs.id, id));
  },

  failStmt(db: AppDatabase, id: string, nextAttemptAt: Date, attempts: number, errorMsg: string, now: Date) {
    const isDead = attempts >= OUTBOX_MAX_ATTEMPTS;
    const truncatedError = errorMsg.slice(0, 1000);
    return db
      .update(outboxJobs)
      .set({
        status: isDead ? "DEAD" : "FAILED",
        attempts,
        nextAttemptAt,
        lastError: truncatedError,
        updatedAt: now,
      })
      .where(eq(outboxJobs.id, id));
  },

  recoverStuckStmt(db: AppDatabase, stuckThreshold: Date, now: Date) {
    return db
      .update(outboxJobs)
      .set({
        status: "FAILED",
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(and(eq(outboxJobs.status, "RUNNING"), lt(outboxJobs.updatedAt, stuckThreshold)));
  },

  async listDue(db: AppDatabase, now: Date, limit: number): Promise<OutboxJob[]> {
    return db
      .select()
      .from(outboxJobs)
      .where(and(inArray(outboxJobs.status, ["PENDING", "FAILED"]), lte(outboxJobs.nextAttemptAt, now)))
      .orderBy(asc(outboxJobs.nextAttemptAt))
      .limit(limit);
  },

  async findSlackPostTaskJob(db: AppDatabase, taskId: string): Promise<OutboxJob | null> {
    const [job] = await db
      .select()
      .from(outboxJobs)
      .where(
        and(eq(outboxJobs.type, "SLACK_POST_TASK"), sql`json_extract(${outboxJobs.payload}, '$.taskId') = ${taskId}`),
      )
      .limit(1);
    return job ?? null;
  },
};
