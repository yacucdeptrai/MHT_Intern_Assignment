import type { TaskStatus } from "@pm/db";

import { taskStatusService } from "../services/taskStatus.service";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface StatusAdminRow extends TaskStatus {
  taskCount: number;
}

export interface AdminStatusesLoaderData {
  statuses: StatusAdminRow[];
}

export async function adminStatusesLoader(ctx: RequestContext, request: Request): Promise<AdminStatusesLoaderData> {
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN"]);

  const [statuses, taskCounts] = await Promise.all([
    taskStatusService.listStatuses(ctx),
    taskStatusService.getTaskCountsByStatus(ctx),
  ]);

  const statusesWithCount: StatusAdminRow[] = statuses.map((status) => ({
    ...status,
    taskCount: taskCounts[status.id] ?? 0,
  }));

  return {
    statuses: statusesWithCount,
  };
}
