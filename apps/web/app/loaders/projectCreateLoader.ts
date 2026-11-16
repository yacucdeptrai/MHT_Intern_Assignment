import { canManageProject, toActor } from "@pm/domain";

import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function projectCreateLoader(ctx: RequestContext, request: Request) {
  const user = await requireUser(ctx, request);
  const actor = toActor(user, null);
  if (!canManageProject(actor, "create")) {
    throw new Response("You do not have permission to access this page", { status: 403 });
  }
  return {};
}
