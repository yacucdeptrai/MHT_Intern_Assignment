import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { tasks } from "./tasks";
import { users } from "./users";

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_attachments_task").on(t.taskId)],
);

export type AttachmentRow = InferSelectModel<typeof attachments>;
export type NewAttachmentRow = InferInsertModel<typeof attachments>;
