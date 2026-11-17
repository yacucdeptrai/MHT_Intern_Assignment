import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { NOTIFICATION_TYPES } from "@pm/domain";
import type { NotificationPayload } from "@pm/domain";

import { projects } from "./projects";
import { users } from "./users";

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    payload: text("payload", { mode: "json" }).$type<NotificationPayload>().notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} IN ('TASK_ASSIGNED', 'TASK_COMMENTED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_REOPENED', 'PROJECT_MEMBER_ADDED')`,
    ),
    index("idx_notifications_user_read").on(table.userId, table.readAt, table.createdAt),
  ],
);

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;
