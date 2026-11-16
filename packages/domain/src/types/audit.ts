import type { AuditAction, AuditEntityType } from "../enums";

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  projectId: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: number;
}
