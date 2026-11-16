import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { OUTBOX_JOB_STATUSES, OUTBOX_JOB_TYPES } from "@pm/domain";

export const outboxJobs = sqliteTable(
  "outbox_jobs",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: OUTBOX_JOB_TYPES }).notNull(),
    payload: text("payload").notNull(),
    status: text("status", { enum: OUTBOX_JOB_STATUSES }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }).notNull(),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_outbox_status_next").on(table.status, table.nextAttemptAt),
    check(
      "outbox_jobs_type_check",
      sql`${table.type} IN ('SLACK_POST_TASK', 'SLACK_UPDATE_THREAD', 'EMAIL_DEADLINE_REMINDER', 'EMAIL_INVITE')`,
    ),
    check(
      "outbox_jobs_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD', 'SKIPPED')`,
    ),
  ],
);

export type OutboxJob = InferSelectModel<typeof outboxJobs>;
export type NewOutboxJob = InferInsertModel<typeof outboxJobs>;
