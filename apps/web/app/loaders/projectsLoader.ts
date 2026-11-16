import { canManageProject, toActor } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectsLoader(ctx: RequestContext, request: Request) {
  const user = await requireUser(ctx, request);
  const actor = toActor(user, null);
  const canCreate = canManageProject(actor, "create");
  const projects = await projectService.listProjects(ctx);

  return {
    projects,
    canCreate,
  };
}
