import type { AuditAction, AuditEntityType } from "../enums";
import type { Page } from "./common";

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

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: number;
}

export interface AuditActorOption {
  id: string;
  fullName: string;
  email: string;
  isDeleted: boolean;
}

export interface AuditFilters {
  actorId?: string | undefined;
  entityType?: AuditEntityType | undefined;
  action?: AuditAction | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  pageSize: number;
}

export interface AdminAuditLogLoaderData {
  entries: Page<AuditLogRow>;
  filters: AuditFilters;
  actors: AuditActorOption[];
}
