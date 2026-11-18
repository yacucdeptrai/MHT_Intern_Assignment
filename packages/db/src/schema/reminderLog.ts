import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { REMINDER_KINDS, type ReminderKind } from "@pm/domain";

import { tasks } from "./tasks";
import { users } from "./users";

export const reminderLog = sqliteTable(
  "reminder_log",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: REMINDER_KINDS }).$type<ReminderKind>().notNull(),
    dueDate: text("due_date").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId, table.kind, table.dueDate], name: "pk_reminder_log" }),
    check("check_reminder_log_kind", sql`${table.kind} IN ('DUE_SOON', 'OVERDUE')`),
  ],
);

export type ReminderLogRow = InferSelectModel<typeof reminderLog>;
export type NewReminderLogRow = InferInsertModel<typeof reminderLog>;
