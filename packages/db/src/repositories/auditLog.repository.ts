import { and, asc, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import type { AuditAction, AuditActorOption, AuditEntityType, AuditLogRow, Page } from "@pm/domain";

import type { AppDatabase } from "../client";
import { auditLogs, type AuditLog, type NewAuditLog } from "../schema/auditLogs";
import { projects } from "../schema/projects";
import { users } from "../schema/users";

export interface ListSystemAuditLogsOptions {
  actorId?: string | undefined;
  entityType?: AuditEntityType | undefined;
  action?: AuditAction | undefined;
  fromMs?: number | undefined;
  toMs?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

interface JoinedAuditRow {
  id: string;
  actorId: string | null;
  actorFullName: string | null;
  actorDeletedAt: Date | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: Date;
}

function mapToAuditLogRow(row: JoinedAuditRow): AuditLogRow {
  let actorName: string;
  if (row.actorId === null) {
    actorName = "System";
  } else if (row.actorDeletedAt !== null || !row.actorFullName) {
    actorName = "Deleted user";
  } else {
    actorName = row.actorFullName;
  }

  return {
    id: row.id,
    actorId: row.actorId,
    actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId,
    projectCode: row.projectCode,
    projectName: row.projectName,
    changes: row.changes,
    createdAt: row.createdAt.getTime(),
  };
}

export const auditLogRepository = {
  insertStmt(db: AppDatabase, entry: NewAuditLog) {
    return db.insert(auditLogs).values(entry);
  },

  async insert(db: AppDatabase, entry: NewAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(entry).returning();
    if (!created) {
      throw new Error("Failed to insert audit log");
    }
    return created;
  },

  async listByEntity(db: AppDatabase, entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt));
  },

  async listByEntityWithActor(db: AppDatabase, entityType: AuditEntityType, entityId: string): Promise<AuditLogRow[]> {
    const rows = await db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorFullName: users.fullName,
        actorDeletedAt: users.deletedAt,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        projectId: auditLogs.projectId,
        projectCode: projects.code,
        projectName: projects.name,
        changes: auditLogs.changes,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .leftJoin(projects, eq(auditLogs.projectId, projects.id))
      .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt));

    return rows.map(mapToAuditLogRow);
  },

  async listByProject(db: AppDatabase, projectId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.projectId, projectId)).orderBy(desc(auditLogs.createdAt));
  },

  async listSystemLogs(db: AppDatabase, options?: ListSystemAuditLogsOptions): Promise<Page<AuditLogRow>> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, options?.pageSize ?? 50);

    const conditions: SQL[] = [];
    if (options?.actorId) {
      conditions.push(eq(auditLogs.actorId, options.actorId));
    }
    if (options?.entityType) {
      conditions.push(eq(auditLogs.entityType, options.entityType));
    }
    if (options?.action) {
      conditions.push(eq(auditLogs.action, options.action));
    }
    if (options?.fromMs !== undefined) {
      conditions.push(gte(auditLogs.createdAt, new Date(options.fromMs)));
    }
    if (options?.toMs !== undefined) {
      conditions.push(lte(auditLogs.createdAt, new Date(options.toMs)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await db.batch([
      db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorFullName: users.fullName,
          actorDeletedAt: users.deletedAt,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          projectId: auditLogs.projectId,
          projectCode: projects.code,
          projectName: projects.name,
          changes: auditLogs.changes,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .leftJoin(projects, eq(auditLogs.projectId, projects.id))
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(auditLogs).where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      items: rows.map(mapToAuditLogRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async listActors(db: AppDatabase): Promise<AuditActorOption[]> {
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .orderBy(asc(users.fullName));

    return rows.map((u) => ({
      id: u.id,
      fullName: u.deletedAt !== null ? "Deleted user" : u.fullName,
      email: u.email,
      isDeleted: u.deletedAt !== null,
    }));
  },
};
