import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { STATUS_CATEGORIES } from "@pm/domain";

export const taskStatuses = sqliteTable(
  "task_statuses",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category", { enum: STATUS_CATEGORIES }).notNull(),
    position: integer("position").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_task_statuses_name").on(table.name),
    uniqueIndex("uq_task_statuses_default")
      .on(table.category)
      .where(sql`is_default = 1`),
    check("task_statuses_category_check", sql`${table.category} IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE')`),
  ],
);

export type TaskStatus = InferSelectModel<typeof taskStatuses>;
export type NewTaskStatus = InferInsertModel<typeof taskStatuses>;
