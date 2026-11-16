import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@pm/domain";
import type { AuditAction, AuditEntityType } from "@pm/domain";

import { projects } from "./projects";
import { users } from "./users";

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    entityType: text("entity_type", { enum: AUDIT_ENTITY_TYPES }).notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id").references(() => projects.id),
    changes: text("changes", { mode: "json" }).$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId, table.createdAt),
    index("idx_audit_created").on(table.createdAt),
    check(
      "audit_logs_entity_type_check",
      sql`${table.entityType} IN ('USER', 'PROJECT', 'PROJECT_MEMBER', 'SPRINT', 'TASK', 'ATTACHMENT', 'STATUS')`,
    ),
    check(
      "audit_logs_action_check",
      sql`${table.action} IN (
        'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED',
        'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED',
        'TASK_CREATED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED',
        'TASK_ASSIGNED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_REOPENED',
        'TASK_ARCHIVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED',
        'SPRINT_CREATED', 'SPRINT_UPDATED', 'SPRINT_ARCHIVED',
        'USER_CREATED', 'USER_UPDATED', 'USER_LOCKED', 'USER_UNLOCKED',
        'USER_DELETED', 'USER_ROLE_CHANGED',
        'STATUS_CREATED', 'STATUS_UPDATED', 'STATUS_DELETED'
      )`,
    ),
  ],
);

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;
