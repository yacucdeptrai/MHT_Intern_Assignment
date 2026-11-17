import { ForbiddenError, NotFoundError, type ProjectHeaderDto, type ProjectPermissions } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProjectHeaderLoaderData {
  project: ProjectHeaderDto;
  permissions: ProjectPermissions;
}

export async function projectHeaderLoader(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<ProjectHeaderLoaderData> {
  await requireUser(ctx, request);

  if (!projectId) {
    throw new Response("Not found", { status: 404 });
  }

  try {
    return await projectService.getProjectHeader(ctx, projectId);
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
