import { StatusCreateSchema, StatusIdSchema, StatusReorderSchema, StatusUpdateSchema } from "@pm/domain";

import { taskStatusService } from "../services/taskStatus.service";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function adminStatusesAction(ctx: RequestContext, request: Request): Promise<Response> {
  try {
    const user = await requireUser(ctx, request);
    requireSystemRole(user, ["ADMIN"]);

    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    const intent = rawData.intent;

    if (intent === "create") {
      const parsed = StatusCreateSchema.safeParse(rawData);
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

      const created = await taskStatusService.createStatus(ctx, parsed.data);
      return Response.json({ success: true, status: created }, { status: 201 });
    }

    if (intent === "update") {
      const parsed = StatusUpdateSchema.safeParse(rawData);
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

      const updated = await taskStatusService.updateStatus(ctx, parsed.data);
      return Response.json({ success: true, status: updated }, { status: 200 });
    }

    if (intent === "reorder") {
      let orderedIds: string[] = formData.getAll("orderedIds").filter((x): x is string => typeof x === "string");
      if (orderedIds.length === 0 && typeof rawData.orderedIds === "string") {
        try {
          const parsed: unknown = JSON.parse(rawData.orderedIds);
          if (Array.isArray(parsed)) {
            orderedIds = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          orderedIds = rawData.orderedIds.split(",");
        }
      }

      const parsed = StatusReorderSchema.safeParse({ orderedIds });
      if (!parsed.success) {
        return Response.json({ success: false, errors: { orderedIds: ["Invalid reorder IDs"] } }, { status: 400 });
      }

      await taskStatusService.reorderStatuses(ctx, parsed.data);
      return Response.json({ success: true }, { status: 200 });
    }

    if (intent === "setDefault") {
      const parsed = StatusIdSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { statusId: ["Invalid status ID"] } }, { status: 400 });
      }

      const updated = await taskStatusService.setDefault(ctx, parsed.data);
      return Response.json({ success: true, status: updated }, { status: 200 });
    }

    if (intent === "delete") {
      const parsed = StatusIdSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { statusId: ["Invalid status ID"] } }, { status: 400 });
      }

      await taskStatusService.deleteStatus(ctx, parsed.data);
      return Response.json({ success: true }, { status: 200 });
    }

    const intentStr = typeof intent === "string" ? intent : "";
    return Response.json({ success: false, message: `Unknown intent: ${intentStr}` }, { status: 400 });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
