import type { LoaderFunctionArgs } from "react-router";

import { ExportFormatSchema } from "@pm/domain";

import { exportService } from "../services/export.service";
import { requireUser } from "../utils/auth.server";
import { contentDispositionAttachment } from "../utils/contentDisposition";
import { handleActionError } from "../utils/errors.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const projectId = params.projectId;
  if (!projectId) {
    return new Response("Project ID is required", { status: 400 });
  }

  const url = new URL(request.url);
  const parsedFormat = ExportFormatSchema.safeParse(url.searchParams.get("format"));
  if (!parsedFormat.success) {
    return new Response("Invalid export format. Allowed formats: csv, rows", { status: 400 });
  }

  try {
    const result = await exportService.exportTasks(ctx, projectId, parsedFormat.data);

    if (result.format === "csv") {
      return new Response(result.data, {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Content-Disposition": contentDispositionAttachment(result.fileName),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return Response.json(result.payload, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
