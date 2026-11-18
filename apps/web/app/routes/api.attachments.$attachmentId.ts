import type { LoaderFunctionArgs } from "react-router";

import { attachmentService } from "../services/attachment.service";
import { requireUser } from "../utils/auth.server";
import { contentDispositionAttachment } from "../utils/contentDisposition";
import { handleActionError } from "../utils/errors.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const attachmentId = params.attachmentId;
  if (!attachmentId) {
    return new Response("Attachment ID is required", { status: 400 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;

  try {
    const downloaded = await attachmentService.downloadAttachment(ctx, attachmentId, {
      expectedProjectId: projectId,
    });

    return new Response(downloaded.stream, {
      status: 200,
      headers: {
        "Content-Type": downloaded.contentType,
        "Content-Disposition": contentDispositionAttachment(downloaded.fileName),
        "Content-Length": String(downloaded.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
