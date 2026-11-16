import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { PROJECT_ROLES } from "@pm/domain";

import { projects } from "./projects";
import { users } from "./users";

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectRole: text("project_role", { enum: PROJECT_ROLES }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId], name: "project_members_pk" }),
    index("idx_project_members_user").on(table.userId),
    check("project_members_role_check", sql`${table.projectRole} IN ('PM', 'TEAM_LEAD', 'MEMBER')`),
  ],
);

export type ProjectMember = InferSelectModel<typeof projectMembers>;
export type NewProjectMember = InferInsertModel<typeof projectMembers>;
