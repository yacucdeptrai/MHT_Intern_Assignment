import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PROJECT_ROLES } from "@pm/domain";

import { projects } from "./projects";
import { users } from "./users";

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").references(() => users.id),
    projectId: text("project_id").references(() => projects.id),
    projectRole: text("project_role", { enum: PROJECT_ROLES }),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => users.id),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_invites_token_hash").on(table.tokenHash),
    index("idx_invites_expires").on(table.acceptedAt, table.expiresAt),
    check(
      "invites_project_role_check",
      sql`${table.projectRole} IS NULL OR ${table.projectRole} IN ('PM', 'TEAM_LEAD', 'MEMBER')`,
    ),
    check("invites_project_parity", sql`(${table.projectId} IS NULL) = (${table.projectRole} IS NULL)`),
  ],
);

export type Invite = InferSelectModel<typeof invites>;
export type NewInvite = InferInsertModel<typeof invites>;
