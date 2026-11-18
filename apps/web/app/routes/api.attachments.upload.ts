import type { ActionFunctionArgs } from "react-router";

import { MAX_ATTACHMENT_BYTES } from "@pm/domain";

import { attachmentService } from "../services/attachment.service";
import { requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  if (request.method !== "POST") {
    return Response.json({ success: false, message: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const projectId = formData.get("projectId");
    const taskId = formData.get("taskId");
    const file = formData.get("file");

    if (typeof projectId !== "string" || !projectId.trim()) {
      return Response.json(
        { success: false, message: "Project ID is required", errors: { projectId: ["Project ID is required"] } },
        { status: 400 },
      );
    }

    if (typeof taskId !== "string" || !taskId.trim()) {
      return Response.json(
        { success: false, message: "Task ID is required", errors: { taskId: ["Task ID is required"] } },
        { status: 400 },
      );
    }

    if (!file || !(file instanceof File)) {
      return Response.json(
        {
          success: false,
          message: "Please select a file to upload",
          errors: { file: ["Please select a file to upload"] },
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      return Response.json(
        { success: false, message: "File is larger than 10 MB", errors: { file: ["File is larger than 10 MB"] } },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await attachmentService.uploadAttachment(ctx, projectId.trim(), taskId.trim(), {
      bytes,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: bytes.length,
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
