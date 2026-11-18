import {
  ForbiddenError,
  MemberReportFiltersSchema,
  NotFoundError,
  getProjectPermissions,
  toActor,
  type MemberReportFilters,
  type MemberReportRow,
  type ProjectPermissions,
} from "@pm/domain";

import { sprintService } from "../services/project/sprint.service";
import { reportService } from "../services/report.service";
import { loadProjectAccess, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProjectReportsLoaderData {
  tab: "members" | "project";
  memberReport?: MemberReportRow[];
  projectReport?: unknown;
  sprints: Array<{ id: string; name: string }>;
  filters: MemberReportFilters;
  permissions: ProjectPermissions;
}

export async function projectReportsLoader(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<ProjectReportsLoaderData> {
  const user = await requireUser(ctx, request);

  if (!projectId) {
    throw new Response("Not found", { status: 404 });
  }

  try {
    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(user, access);
    const permissions = getProjectPermissions(actor);

    const url = new URL(request.url);
    const requestedTab = url.searchParams.get("tab");

    let activeTab: "members" | "project";
    if (requestedTab === "members") {
      if (!permissions.canViewMemberReport) {
        throw new Response("Forbidden", { status: 403 });
      }
      activeTab = "members";
    } else if (requestedTab === "project") {
      if (!permissions.canViewProjectReport) {
        throw new Response("Forbidden", { status: 403 });
      }
      activeTab = "project";
    } else if (!requestedTab) {
      if (permissions.canViewMemberReport) {
        activeTab = "members";
      } else if (permissions.canViewProjectReport) {
        activeTab = "project";
      } else {
        throw new Response("Forbidden", { status: 403 });
      }
    } else {
      throw new Response("Not found", { status: 404 });
    }

    const sprintsList = await sprintService.listSprints(ctx, projectId);
    const sprints = sprintsList.map((s) => ({ id: s.id, name: s.name }));

    const rawFilters = {
      sprintId: url.searchParams.get("sprintId") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    };
    const parsed = MemberReportFiltersSchema.safeParse(rawFilters);
    const filters = parsed.success ? parsed.data : {};

    let memberReport: MemberReportRow[] | undefined;
    if (activeTab === "members") {
      memberReport = await reportService.getMemberReport(ctx, projectId, filters);
    }

    return {
      tab: activeTab,
      memberReport,
      sprints,
      filters,
      permissions,
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}
