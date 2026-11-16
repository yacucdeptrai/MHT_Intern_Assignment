import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import type { OAuthProvider } from "@pm/domain";

import { getAuthenticator, isOAuthProviderConfigured } from "../services/auth/oauth.server";
import { requestContextKey } from "../utils/requestContext.server";

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

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const provider = resolveProvider(params.provider);

  if (!provider || !isOAuthProviderConfigured(ctx.env, provider)) {
    return new Response("Not Found", { status: 404 });
  }

  const authenticator = getAuthenticator(ctx);
  return authenticator.authenticate(provider.toLowerCase(), request);
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const provider = resolveProvider(params.provider);

  if (!provider || !isOAuthProviderConfigured(ctx.env, provider)) {
    return new Response("Not Found", { status: 404 });
  }

  const authenticator = getAuthenticator(ctx);
  return authenticator.authenticate(provider.toLowerCase(), request);
}
