import type { MemberOption, Page, ProjectTaskFilters, SprintOption, StatusOption, TaskListItem } from "@pm/domain";

import { taskService } from "../services/task.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProjectTasksLoaderData {
  tasks: Page<TaskListItem>;
  filters: ProjectTaskFilters;
  statuses: StatusOption[];
  members: MemberOption[];
  sprints: SprintOption[];
  canCreate: boolean;
  canAssign: boolean;
}

export async function projectTasksLoader(
  ctx: RequestContext,
  projectId: string,
  request: Request,
): Promise<ProjectTasksLoaderData> {
  await requireUser(ctx, request);
  const url = new URL(request.url);
  const rawFilters = Object.fromEntries(url.searchParams);
  return taskService.listProjectTasks(ctx, projectId, rawFilters);
}
