import type { TaskDetailLoaderData } from "@pm/domain";

import { taskService } from "../services/task.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function taskDetailLoader(
  ctx: RequestContext,
  projectId: string,
  taskId: string,
  request: Request,
): Promise<TaskDetailLoaderData> {
  await requireUser(ctx, request);
  return taskService.getTaskDetails(ctx, projectId, taskId);
}
