import type { AdminDashboardLoaderData } from "@pm/domain";

import { dashboardService } from "../services/dashboard.service";
import type { SessionUser } from "../utils/auth.server";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface AdminDashboardLoaderResult extends AdminDashboardLoaderData {
  user: SessionUser;
}

export async function adminDashboardLoader(ctx: RequestContext, request: Request): Promise<AdminDashboardLoaderResult> {
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN", "PM"]);

  const data = await dashboardService.getAdminDashboard(ctx);
  return {
    user,
    ...data,
  };
}
