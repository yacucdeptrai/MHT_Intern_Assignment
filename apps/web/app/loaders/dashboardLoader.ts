import { redirect } from "react-router";
import type { DashboardLoaderData } from "@pm/domain";

import { dashboardService } from "../services/dashboard.service";
import type { SessionUser } from "../utils/auth.server";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface MemberDashboardLoaderResult extends DashboardLoaderData {
  user: SessionUser;
}

export async function dashboardLoader(ctx: RequestContext, request: Request): Promise<MemberDashboardLoaderResult> {
  const user = await requireUser(ctx, request);
  if (user.systemRole === "ADMIN" || user.systemRole === "PM") {
    throw redirect("/admin");
  }

  const data = await dashboardService.getPersonalDashboard(ctx);
  return {
    user,
    ...data,
  };
}
