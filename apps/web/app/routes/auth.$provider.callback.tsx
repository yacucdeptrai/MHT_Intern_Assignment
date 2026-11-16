import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import type { OAuthProvider } from "@pm/domain";
import { ValidationError } from "@pm/domain";

import {
  getAuthenticator,
  getOAuthStateCookie,
  isOAuthProviderConfigured,
  type OAuthStateData,
} from "../services/auth/oauth.server";
import { getSafeRedirect } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";
import { commitSession, getSession, isRequestSecure } from "../utils/session.server";

function resolveProvider(providerParam?: string): OAuthProvider | null {
  if (!providerParam) {
    return null;
  }
  const normalized = providerParam.toUpperCase();
  if (normalized === "GOOGLE" || normalized === "MICROSOFT") {
    return normalized;
  }
  return null;
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const provider = resolveProvider(params.provider);

  if (!provider || !isOAuthProviderConfigured(ctx.env, provider)) {
    return new Response("Not Found", { status: 404 });
  }

  const isSecure = isRequestSecure(request) || ctx.env.APP_ENV === "production" || ctx.env.APP_ENV === "staging";
  const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET, isSecure);

  try {
    const authenticator = getAuthenticator(ctx);
    const user = await authenticator.authenticate(provider.toLowerCase(), request);

    const savedData = (await cookieHelper.parse(request.headers.get("Cookie"))) as OAuthStateData | null;
    const defaultHome = user.systemRole === "ADMIN" || user.systemRole === "PM" ? "/admin" : "/";
    const destination = getSafeRedirect(savedData?.redirectTo, defaultHome);

    const session = await getSession(request, ctx.env.SESSION_SECRET);
    session.set("userId", user.id);

    const sessionCookie = await commitSession(session, { secret: ctx.env.SESSION_SECRET, secure: isSecure });
    const clearStateCookie = await cookieHelper.serialize("", { maxAge: 0 });

    const headers = new Headers();
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearStateCookie);

    return redirect(destination, { headers });
  } catch (error: unknown) {
    if (error instanceof Response) {
      return error;
    }

    const clearStateCookie = await cookieHelper.serialize("", { maxAge: 0 });
    const headers = new Headers();
    headers.append("Set-Cookie", clearStateCookie);

    if (error instanceof ValidationError) {
      if (error.message.includes("No account exists")) {
        return redirect("/login?error=no_account", { headers });
      }
      if (error.message.includes("locked")) {
        return redirect("/login?error=locked", { headers });
      }
    }

    const errObj = error instanceof Error ? error : new Error(String(error));
    ctx.logger.warn("OAuth callback failed", { error: errObj });
    return redirect("/login?error=failed", { headers });
  }
}
