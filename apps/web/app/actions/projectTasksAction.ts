import { taskService } from "../services/task.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectTasksAction(ctx: RequestContext, projectId: string, request: Request): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    await requireUser(ctx, request);

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);
    const intent = rawData.intent;

    if (intent === "createTask") {
      const task = await taskService.createTask(ctx, projectId, rawData);
      return Response.json({ success: true, task }, { status: 201 });
    }

    const intentStr = typeof intent === "string" ? intent : "";
    return Response.json({ success: false, message: `Unknown intent: ${intentStr}` }, { status: 400 });
  } catch (error) {
    const response = handleActionError(error, ctx);
    if (response.status === 400) {
      const json = await response.json<Record<string, unknown>>();
      return Response.json({ ...json, values: rawData }, { status: 400 });
    }
    return response;
  }
}
