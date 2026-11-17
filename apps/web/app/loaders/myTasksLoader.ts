import type { MyTasksLoaderData } from "@pm/domain";

import { taskService } from "../services/task.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function myTasksLoader(ctx: RequestContext, request: Request): Promise<MyTasksLoaderData> {
  await requireUser(ctx, request);
  const url = new URL(request.url);
  const rawFilters = Object.fromEntries(url.searchParams);
  return taskService.listMyTasks(ctx, rawFilters);
}
