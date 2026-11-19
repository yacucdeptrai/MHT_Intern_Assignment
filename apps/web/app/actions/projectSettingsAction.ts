import { redirect } from "react-router";

import { NotFoundError, ProjectUpdateSchema } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectSettingsAction(
  ctx: RequestContext,
  request: Request,
  projectId: string,
): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    await requireUser(ctx, request);

    if (!projectId) {
      throw new NotFoundError("Project not found", { key: "errors.project_not_found" });
    }

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);

    const intent = rawData.intent;
    if (intent !== "update" && intent !== "archive") {
      return Response.json({ success: false, errors: { intent: ["Invalid or missing intent"] } }, { status: 400 });
    }

    if (intent === "archive") {
      await projectService.archiveProject(ctx, projectId);
      return redirect("/projects");
    }

    // intent === "update"
    const parsed = ProjectUpdateSchema.safeParse(rawData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      return Response.json({ success: false, errors: fieldErrors, values: rawData }, { status: 400 });
    }

    const updated = await projectService.updateProject(ctx, projectId, parsed.data);
    return Response.json({ success: true, project: updated });
  } catch (error) {
    const response = handleActionError(error, ctx);
    if (response.status === 400) {
      const json = await response.json<Record<string, unknown>>();
      return Response.json({ ...json, values: rawData }, { status: 400 });
    }
    return response;
  }
}
