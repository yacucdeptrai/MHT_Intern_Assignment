import { AppError, type AdminAuditLogLoaderData } from "@pm/domain";

import { auditLogService } from "../services/auditLog.service";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function adminAuditLogLoader(ctx: RequestContext, request: Request): Promise<AdminAuditLogLoaderData> {
  const user = await requireUser(ctx, request);
  requireSystemRole(user, ["ADMIN"]);

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  try {
    return await auditLogService.listSystemAuditLogs(ctx, rawParams);
  } catch (err) {
    if (err instanceof AppError) {
      throw new Response(err.message, { status: err.status });
    }
    throw err;
  }
}
