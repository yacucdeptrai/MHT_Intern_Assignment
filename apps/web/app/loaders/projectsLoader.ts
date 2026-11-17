import { canManageProject, toActor } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectsLoader(ctx: RequestContext, request: Request) {
  const user = await requireUser(ctx, request);
  const actor = toActor(user, null);
  const canCreate = canManageProject(actor, "create");
  const isAdmin = user.systemRole === "ADMIN";

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "active";
  const archivedOnly = isAdmin && filter === "archived";

  const projects = await projectService.listProjects(ctx, { archivedOnly });

  return {
    projects,
    canCreate,
    filter,
    isAdmin,
  };
}
