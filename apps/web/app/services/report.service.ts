import type { MemberReportFilters, MemberReportRow, ProjectReportDto } from "@pm/domain";
import {
  canViewMemberReport,
  canViewProjectReport,
  ForbiddenError,
  getEndOfDayMs,
  getTodayDateString,
  toActor,
  UnauthorizedError,
} from "@pm/domain";
import { reportRepository } from "@pm/db";

import { sprintService } from "./project/sprint.service";
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

  async getProjectReport(ctx: RequestContext, projectId: string): Promise<ProjectReportDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (!canViewProjectReport(actor)) {
      throw new ForbiddenError("Insufficient permissions to view project report");
    }

    const now = ctx.clock.now();
    const todayStr = getTodayDateString(now);
    const staleThresholdMs = now.getTime() - 2 * 24 * 60 * 60 * 1000;

    const [sprintCompletion, reportData] = await Promise.all([
      sprintService.listSprints(ctx, projectId),
      reportRepository.getProjectReportData(ctx.db, {
        projectId,
        todayStr,
        nowMs: now.getTime(),
        staleThresholdMs,
      }),
    ]);

    const totalTasks = reportData.statusDistribution.reduce((acc, s) => acc + s.taskCount, 0);
    const doneTasks = reportData.statusDistribution
      .filter((s) => s.category === "DONE")
      .reduce((acc, s) => acc + s.taskCount, 0);
    const completionRate = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    const statusDistribution = reportData.statusDistribution.map((s) => ({
      statusId: s.statusId,
      statusName: s.statusName,
      category: s.category,
      position: s.position,
      taskCount: s.taskCount,
      percentage: totalTasks === 0 ? 0 : Math.round((s.taskCount / totalTasks) * 100),
    }));

    return {
      totalTasks,
      doneTasks,
      completionRate,
      statusDistribution,
      sprintCompletion,
      bottlenecks: {
        staleReviews: reportData.staleReviews,
        overdueByStatus: reportData.overdueByStatus,
      },
    };
  },
};
