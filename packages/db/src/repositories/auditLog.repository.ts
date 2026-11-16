import { and, desc, eq } from "drizzle-orm";

import type { AuditEntityType } from "@pm/domain";

import type { AppDatabase } from "../client";
import { auditLogs, type AuditLog, type NewAuditLog } from "../schema/auditLogs";

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
};
