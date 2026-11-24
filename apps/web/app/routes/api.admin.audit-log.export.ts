import type { LoaderFunctionArgs } from "react-router";

import { auditLogService } from "../services/auditLog.service";
import { requireUser } from "../utils/auth.server";
import { contentDispositionAttachment } from "../utils/contentDisposition";
import { handleActionError } from "../utils/errors.server";
import { requestContextKey } from "../utils/requestContext.server";

/** CSV download of the system audit log, filtered by the same query string as /admin/audit-log. */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const filters = Object.fromEntries(new URL(request.url).searchParams.entries());

  try {
    const result = await auditLogService.exportSystemAuditLogsCsv(ctx, filters);
    return new Response(result.data, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": contentDispositionAttachment(result.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleActionError(error, ctx);
  }
}
