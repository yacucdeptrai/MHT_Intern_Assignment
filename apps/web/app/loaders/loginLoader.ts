import { redirect } from "react-router";

import type { OAuthProvider } from "@pm/domain";

import { getConfiguredOAuthProviders } from "../services/auth/oauth.server";
import { getOptionalUser, getSafeRedirect } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface LoginLoaderData {
  redirectTo: string | null;
  ssoProviders: OAuthProvider[];
  ssoError: string | null;
}

export async function loginLoader(ctx: RequestContext, request: Request): Promise<LoginLoaderData> {
  const user = await getOptionalUser(ctx, request);
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo");

  if (user) {
    const defaultHome = user.systemRole === "ADMIN" || user.systemRole === "PM" ? "/admin" : "/";
    throw redirect(getSafeRedirect(redirectTo, defaultHome));
  }

  const ssoProviders = getConfiguredOAuthProviders(ctx.env);

  const errorParam = url.searchParams.get("error");
  let ssoError: string | null = null;
  if (errorParam === "no_account") {
    ssoError = "No account exists for this email. Ask an administrator for an invite.";
  } else if (errorParam === "locked") {
    ssoError = "This account is locked. Contact an administrator.";
  } else if (errorParam === "failed") {
    ssoError = "Authentication failed. Please try again.";
  }

  return { redirectTo, ssoProviders, ssoError };
}
