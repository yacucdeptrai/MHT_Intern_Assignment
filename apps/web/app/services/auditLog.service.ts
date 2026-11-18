import { auditLogRepository } from "@pm/db";
import {
  AuditFiltersSchema,
  canViewAuditLog,
  ForbiddenError,
  getEndOfDayMs,
  getStartOfDayMs,
  UnauthorizedError,
  ValidationError,
  type ActorContext,
  type AdminAuditLogLoaderData,
} from "@pm/domain";

import type { RequestContext } from "../utils/requestContext.server";

function getActorContext(ctx: RequestContext): ActorContext {
  if (!ctx.user) {
    throw new UnauthorizedError("Authentication required");
  }
  return {
    userId: ctx.user.id,
    systemRole: ctx.user.systemRole,
    projectRole: null,
    isProjectArchived: false,
  };
}

export const auditLogService = {
  async listSystemAuditLogs(ctx: RequestContext, rawFilters: unknown): Promise<AdminAuditLogLoaderData> {
    const actor = getActorContext(ctx);
    if (!canViewAuditLog(actor)) {
      throw new ForbiddenError("You do not have permission to view the system audit log");
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
      throw new ValidationError("Invalid audit log filters", fieldErrors);
    }

    const filters = parsed.data;
    const fromMs = filters.from ? getStartOfDayMs(filters.from) : undefined;
    const toMs = filters.to ? getEndOfDayMs(filters.to) : undefined;

    const [entries, actors] = await Promise.all([
      auditLogRepository.listSystemLogs(ctx.db, {
        actorId: filters.actorId,
        entityType: filters.entityType,
        action: filters.action,
        fromMs,
        toMs,
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
};
