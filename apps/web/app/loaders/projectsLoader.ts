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
  const progress = await projectService.getTaskProgress(
    ctx,
    projects.map((project) => project.id),
  );
  // Tab counts for the admin Active / Archived tabs.
  const otherCount = isAdmin ? (await projectService.listProjects(ctx, { archivedOnly: !archivedOnly })).length : 0;
  const counts = {
    active: archivedOnly ? otherCount : projects.length,
    archived: archivedOnly ? projects.length : otherCount,
  };

  return {
    projects,
    progress,
    counts,
    canCreate,
    filter,
    isAdmin,
  };
}
