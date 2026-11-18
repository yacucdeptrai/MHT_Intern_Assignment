import type { LoaderFunctionArgs } from "react-router";

import { attachmentService } from "../services/attachment.service";
import { requireUser } from "../utils/auth.server";
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
    const downloaded = await attachmentService.downloadAttachment(
      ctx,
      projectId ?? attachmentId,
      projectId ? attachmentId : undefined,
    );

    const safeAsciiName = downloaded.fileName.replace(/[^\x20-\x7e]/g, "_");
    const encodedName = encodeURIComponent(downloaded.fileName);

    return new Response(downloaded.stream, {
      status: 200,
      headers: {
        "Content-Type": downloaded.contentType,
        "Content-Disposition": `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(downloaded.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
