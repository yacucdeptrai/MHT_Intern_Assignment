import { projectMemberRepository, taskRepository, taskStatusRepository, type TaskRow, type TaskStatus } from "@pm/db";
import { ForbiddenError, canAssignTask, canCreateTask, toActor, type MemberRow } from "@pm/domain";

import { loadProjectAccess, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProjectTasksLoaderData {
  tasks: TaskRow[];
  members: MemberRow[];
  statuses: TaskStatus[];
  canCreate: boolean;
  canAssign: boolean;
}

export async function projectTasksLoader(
  ctx: RequestContext,
  projectId: string,
  request: Request,
): Promise<ProjectTasksLoaderData> {
  const user = await requireUser(ctx, request);
  const access = await loadProjectAccess(ctx, projectId);

  if (access.isArchived) {
    throw new ForbiddenError("This project is archived");
  }

  const actor = toActor(user, access);

  const [tasks, members, statuses] = await Promise.all([
    taskRepository.listByProject(ctx.db, projectId),
    projectMemberRepository.listByProjectWithUser(ctx.db, projectId),
    taskStatusRepository.list(ctx.db),
  ]);

  return {
    tasks,
    members,
    statuses,
    canCreate: canCreateTask(actor),
    canAssign: canAssignTask(actor),
  };
}
