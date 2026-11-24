import { auditLogRepository } from "@pm/db";
import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_EXPORT_MAX_ROWS,
  AuditFiltersSchema,
  canViewAuditLog,
  formatCsv,
  ForbiddenError,
  getEndOfDayMs,
  getStartOfDayMs,
  UnauthorizedError,
  ValidationError,
  type ActorContext,
  type AdminAuditLogLoaderData,
  type AuditFiltersOutput,
  type AuditLogRow,
} from "@pm/domain";

import { extractAuditDiffs, formatAuditTimestamp } from "../utils/formatAudit";
import type { RequestContext } from "../utils/requestContext.server";

function getActorContext(ctx: RequestContext): ActorContext {
  if (!ctx.user) {
    throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
  }
  return {
    userId: ctx.user.id,
    systemRole: ctx.user.systemRole,
    projectRole: null,
    isProjectArchived: false,
  };
}

/** Admin-only gate plus filter parsing shared by the audit log screen and its CSV export. */
function authorizeAndParseFilters(ctx: RequestContext, rawFilters: unknown): AuditFiltersOutput {
  const actor = getActorContext(ctx);
  if (!canViewAuditLog(actor)) {
    throw new ForbiddenError("You do not have permission to view the system audit log", {
      key: "errors.audit_view_forbidden",
    });
  }

  const parsed = AuditFiltersSchema.safeParse(rawFilters ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        fieldErrors[field] = fieldErrors[field] ?? [];
        fieldErrors[field].push(issue.message);
      }
    }
    throw new ValidationError("Invalid audit log filters", {
      key: "errors.audit_invalid_filters",
      fieldErrors: fieldErrors,
    });
  }
  return parsed.data;
}

function toRepositoryFilters(filters: AuditFiltersOutput) {
  return {
    actorId: filters.actorId,
    entityType: filters.entityType,
    action: filters.action,
    fromMs: filters.from ? getStartOfDayMs(filters.from) : undefined,
    toMs: filters.to ? getEndOfDayMs(filters.to) : undefined,
  };
}

/** One CSV row per entry; the Changes cell matches the on-screen "field: from → to" lines. */
export function buildAuditExportRow(row: AuditLogRow): string[] {
  const { reason, diffs } = extractAuditDiffs(row.changes);
  const changes = diffs.map((diff) => `${diff.field}: ${diff.fromText} → ${diff.toText}`);
  if (reason) changes.push(`Reason: ${reason}`);
  return [
    new Date(row.createdAt).toISOString(),
    row.actorName,
    row.action,
    row.entityType,
    row.entityId,
    row.projectCode ?? "",
    changes.join("; "),
  ];
}

export interface AuditExportCsvResult {
  data: string;
  contentType: string;
  fileName: string;
}

export const auditLogService = {
  async listSystemAuditLogs(ctx: RequestContext, rawFilters: unknown): Promise<AdminAuditLogLoaderData> {
    const filters = authorizeAndParseFilters(ctx, rawFilters);

    const [entries, actors] = await Promise.all([
      auditLogRepository.listSystemLogs(ctx.db, {
        ...toRepositoryFilters(filters),
        page: filters.page,
        pageSize: filters.pageSize,
      }),
      auditLogRepository.listActors(ctx.db),
    ]);

    return {
      entries,
      filters,
      actors,
    };
  },

  /** Admin-only CSV of the entries matching the screen's filters, newest first (FR-24). */
  async exportSystemAuditLogsCsv(ctx: RequestContext, rawFilters: unknown): Promise<AuditExportCsvResult> {
    const filters = authorizeAndParseFilters(ctx, rawFilters);
    const rows = await auditLogRepository.listSystemLogsForExport(
      ctx.db,
      toRepositoryFilters(filters),
      AUDIT_EXPORT_MAX_ROWS,
    );
    const day = formatAuditTimestamp(ctx.clock.now().getTime()).slice(0, 10);
    return {
      data: formatCsv([[...AUDIT_EXPORT_COLUMNS], ...rows.map(buildAuditExportRow)]),
      contentType: "text/csv; charset=utf-8",
      fileName: `audit-log-${day}.csv`,
    };
  },
};
