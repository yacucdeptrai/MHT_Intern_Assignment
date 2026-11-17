import { redirect } from "react-router";

import { taskService } from "../services/task.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function taskDetailAction(
  ctx: RequestContext,
  projectId: string,
  taskId: string,
  request: Request,
): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    await requireUser(ctx, request);

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);
    const intent = rawData.intent;

    if (intent === "update") {
      const task = await taskService.updateTask(ctx, projectId, taskId, rawData);
      return Response.json({ success: true, task }, { status: 200 });
    }

    if (intent === "assign") {
      const task = await taskService.assignTask(ctx, projectId, taskId, rawData);
      return Response.json({ success: true, task }, { status: 200 });
    }

    if (intent === "archive") {
      await taskService.archiveTask(ctx, projectId, taskId, rawData);
      return redirect(`/projects/${projectId}`);
    }

    // TODO(M3-T7): addSubTask intent
    // TODO(M4): changeStatus, approve, reject, reopen intents
    // TODO(M5): comment, deleteComment, deleteAttachment intents

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
