import { redirect } from "react-router";

import { TaskApproveSchema, TaskReasonSchema, TaskStatusChangeSchema } from "@pm/domain";

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
      const rawEntries = formData
        .getAll("assigneeIds")
        .filter((x): x is string => typeof x === "string")
        .flatMap((s) =>
          s
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        );
      const task = await taskService.assignTask(ctx, projectId, taskId, {
        ...rawData,
        assigneeIds: rawEntries,
      });
      return Response.json({ success: true, task }, { status: 200 });
    }

    if (intent === "archive") {
      await taskService.archiveTask(ctx, projectId, taskId, rawData);
      return redirect(`/projects/${projectId}`);
    }

    if (intent === "addSubTask") {
      const subTask = await taskService.createTask(ctx, projectId, {
        ...rawData,
        parentTaskId: taskId,
      });
      return Response.json({ success: true, subTask }, { status: 200 });
    }

    if (intent === "changeStatus") {
      const parsed = TaskStatusChangeSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        let firstMessage: string | undefined;
        for (const issue of parsed.error.issues) {
          firstMessage ??= issue.message;
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json(
          { success: false, errors: fieldErrors, message: firstMessage ?? "Invalid status change", values: rawData },
          { status: 400 },
        );
      }
      const task = await taskService.changeStatus(ctx, projectId, taskId, parsed.data);
      return Response.json({ success: true, task }, { status: 200 });
    }

    if (intent === "approve") {
      const parsed = TaskApproveSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        let firstMessage: string | undefined;
        for (const issue of parsed.error.issues) {
          firstMessage ??= issue.message;
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json(
          { success: false, errors: fieldErrors, message: firstMessage ?? "Invalid approval request", values: rawData },
          { status: 400 },
        );
      }
      const task = await taskService.approveTask(ctx, projectId, taskId, parsed.data);
      return Response.json({ success: true, task }, { status: 200 });
    }

    if (intent === "reject" || intent === "reopen") {
      const parsed = TaskReasonSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        let firstMessage: string | undefined;
        for (const issue of parsed.error.issues) {
          firstMessage ??= issue.message;
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json(
          { success: false, errors: fieldErrors, message: firstMessage ?? "A reason is required", values: rawData },
          { status: 400 },
        );
      }
      const task =
        intent === "reject"
          ? await taskService.rejectTask(ctx, projectId, taskId, parsed.data)
          : await taskService.reopenTask(ctx, projectId, taskId, parsed.data);
      return Response.json({ success: true, task }, { status: 200 });
    }

    // TODO(M5-T1): comment and deleteComment intents (A21, A22)
    // TODO(M5-T2): deleteAttachment intent (A24)

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
