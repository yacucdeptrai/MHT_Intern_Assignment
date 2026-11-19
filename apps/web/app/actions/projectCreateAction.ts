import { redirect } from "react-router";

import { ForbiddenError, ProjectCreateSchema, canManageProject, toActor } from "@pm/domain";

import { projectService } from "../services/project/project.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectCreateAction(ctx: RequestContext, request: Request): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    const user = await requireUser(ctx, request);
    const actor = toActor(user, null);
    if (!canManageProject(actor, "create")) {
      throw new ForbiddenError("You do not have permission to create a project", {
        key: "errors.project_create_forbidden",
      });
    }

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);

    const parsed = ProjectCreateSchema.safeParse(rawData);
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

    await projectService.createProject(ctx, parsed.data);
    return redirect("/projects");
  } catch (error) {
    const response = handleActionError(error, ctx);
    if (response.status === 400) {
      const json = await response.json<Record<string, unknown>>();
      return Response.json({ ...json, values: rawData }, { status: 400 });
    }
    return response;
  }
}
