import { ForbiddenError, NotFoundError, type ProjectPermissions, type ProjectSettingsDto } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProjectSettingsLoaderData {
  project: ProjectSettingsDto;
  permissions: ProjectPermissions;
}

export async function projectSettingsLoader(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<ProjectSettingsLoaderData> {
  await requireUser(ctx, request);

  if (!projectId) {
    throw new Response("Not found", { status: 404 });
  }

  try {
    return await projectService.getProjectSettings(ctx, projectId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Response("Not found", { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      throw new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}
