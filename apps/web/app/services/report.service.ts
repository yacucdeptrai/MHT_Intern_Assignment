import type { MemberReportFilters, MemberReportRow } from "@pm/domain";
import {
  canViewMemberReport,
  ForbiddenError,
  getEndOfDayMs,
  getTodayDateString,
  toActor,
  UnauthorizedError,
} from "@pm/domain";
import { reportRepository } from "@pm/db";

import { loadProjectAccess } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export const reportService = {
  async getMemberReport(
    ctx: RequestContext,
    projectId: string,
    filters: MemberReportFilters,
  ): Promise<MemberReportRow[]> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (!canViewMemberReport(actor)) {
      throw new ForbiddenError("Insufficient permissions to view member report");
    }

    const now = ctx.clock.now();
    const todayStr = getTodayDateString(now);

    let fromMs: number | undefined;
    if (filters.from) {
      const [y, m, d] = filters.from.split("-").map(Number);
      fromMs = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
    }

    let toMs: number | undefined;
    if (filters.to) {
      toMs = getEndOfDayMs(filters.to);
    }

    return reportRepository.getMemberReport(ctx.db, {
      projectId,
      sprintId: filters.sprintId,
      fromMs,
      toMs,
      todayStr,
    });
  },
};
