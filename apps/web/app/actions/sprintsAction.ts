import { NotFoundError } from "@pm/domain";

import { sprintService } from "../services/project/sprint.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function sprintsAction(ctx: RequestContext, request: Request, projectId: string): Promise<Response> {
  try {
    await requireUser(ctx, request);

    if (!projectId) {
      throw new NotFoundError("Project not found");
    }

    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);

    const intent = rawData.intent;
    if (intent !== "create" && intent !== "update" && intent !== "archive") {
      return Response.json({ success: false, errors: { intent: ["Invalid or missing intent"] } }, { status: 400 });
    }

    if (intent === "create") {
      const sprint = await sprintService.createSprint(ctx, projectId, rawData);
      return Response.json({ success: true, sprint });
    }

    if (intent === "update") {
      const sprint = await sprintService.updateSprint(ctx, projectId, rawData);
      return Response.json({ success: true, sprint });
    }

    const sprint = await sprintService.archiveSprint(ctx, projectId, rawData);
    return Response.json({ success: true, sprint });
  } catch (err) {
    return handleActionError(err, ctx);
  }
}
