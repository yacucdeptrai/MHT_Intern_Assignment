import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PROJECT_STATUSES } from "@pm/domain";

import { users } from "./users";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    budget: integer("budget"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("ACTIVE"),
    slackChannelId: text("slack_channel_id"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("uq_projects_code").on(table.code),
    check("projects_code_length", sql`length(${table.code}) BETWEEN 2 AND 10`),
    check("projects_budget_check", sql`${table.budget} IS NULL OR ${table.budget} >= 0`),
    check("projects_dates_check", sql`${table.endDate} >= ${table.startDate}`),
    check("projects_status_check", sql`${table.status} IN ('ACTIVE', 'ON_HOLD', 'COMPLETED')`),
  ],
);

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;
