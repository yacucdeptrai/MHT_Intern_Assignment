import { ForbiddenError, NotFoundError, canManageSprint, toActor, type SprintWithStatsDto } from "@pm/domain";

import { sprintService } from "../services/project/sprint.service";
import { loadProjectAccess, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface SprintsLoaderData {
  project: {
    id: string;
    name: string;
    code: string;
  };
  sprints: SprintWithStatsDto[];
  permissions: {
    canManageSprint: boolean;
  };
}

export async function sprintsLoader(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<SprintsLoaderData> {
  const user = await requireUser(ctx, request);

  if (!projectId) {
    throw new Response("Not found", { status: 404 });
  }

  try {
    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(user, access);
    const sprints = await sprintService.listSprints(ctx, projectId);

    return {
      project: {
        id: access.project.id,
        name: access.project.name,
        code: access.project.code,
      },
      sprints,
      permissions: {
        canManageSprint: canManageSprint(actor),
      },
    };
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
