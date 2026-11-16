import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { SYSTEM_ROLES, USER_STATUSES } from "@pm/domain";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    department: text("department"),
    avatarKey: text("avatar_key"),
    passwordHash: text("password_hash"),
    passwordIterations: integer("password_iterations"),
    systemRole: text("system_role", { enum: SYSTEM_ROLES }).notNull().default("MEMBER"),
    status: text("status", { enum: USER_STATUSES }).notNull().default("ACTIVE"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("uq_users_email").on(table.email),
    index("idx_users_status_deleted").on(table.deletedAt, table.status),
    check(
      "users_password_parity",
      sql`(${table.passwordHash} IS NULL) = (${table.passwordIterations} IS NULL)`,
    ),
    check(
      "users_system_role_check",
      sql`${table.systemRole} IN ('MEMBER', 'TEAM_LEAD', 'PM', 'ADMIN')`,
    ),
    check(
      "users_status_check",
      sql`${table.status} IN ('ACTIVE', 'LOCKED')`,
    ),
  ],
);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
