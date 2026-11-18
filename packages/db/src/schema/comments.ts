import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { tasks } from "./tasks";
import { users } from "./users";

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    parentCommentId: text("parent_comment_id"),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    foreignKey({
      columns: [t.parentCommentId],
      foreignColumns: [t.id],
      name: "fk_comments_parent",
    }),
    index("idx_comments_task").on(t.taskId, t.createdAt),
  ],
);

export type CommentRow = InferSelectModel<typeof comments>;
export type NewCommentRow = InferInsertModel<typeof comments>;
