import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { tasks } from "./tasks";
import { users } from "./users";

export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userId], name: "pk_task_assignees" }),
    index("idx_task_assignees_user").on(t.userId),
  ],
);

export type TaskAssigneeRow = InferSelectModel<typeof taskAssignees>;
export type NewTaskAssigneeRow = InferInsertModel<typeof taskAssignees>;
