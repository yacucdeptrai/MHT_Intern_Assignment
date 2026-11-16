import { redirect } from "react-router";

import { getOptionalUser, getSafeRedirect } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface LoginLoaderData {
  redirectTo: string | null;
}

export async function loginLoader(ctx: RequestContext, request: Request): Promise<LoginLoaderData> {
  const user = await getOptionalUser(ctx, request);
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo");

  if (user) {
    const defaultHome = user.systemRole === "ADMIN" || user.systemRole === "PM" ? "/admin" : "/";
    throw redirect(getSafeRedirect(redirectTo, defaultHome));
  }

  return { redirectTo };
}
