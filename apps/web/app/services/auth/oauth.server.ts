import { createCookie, redirect } from "react-router";
import { Authenticator } from "remix-auth";
import { Strategy } from "remix-auth/strategy";

import type { OAuthClient, OAuthProfile, OAuthProvider, SessionUser } from "@pm/domain";
import { ValidationError } from "@pm/domain";

import type { RequestContext } from "../../utils/requestContext.server";
import { isRequestSecure } from "../../utils/session.server";
import { authService } from "./auth.service";

export interface OAuthStateData {
  state: string;
  redirectTo?: string;
}

export function isOAuthProviderConfigured(env: Partial<Env>, provider: OAuthProvider): boolean {
  if (provider === "GOOGLE") {
    const id = env.GOOGLE_CLIENT_ID?.trim();
    const secret = env.GOOGLE_CLIENT_SECRET?.trim();
    return Boolean(id && secret && !id.startsWith("replace-with-") && !secret.startsWith("replace-with-"));
  }
  const id = env.MICROSOFT_CLIENT_ID?.trim();
  const secret = env.MICROSOFT_CLIENT_SECRET?.trim();
  return Boolean(id && secret && !id.startsWith("replace-with-") && !secret.startsWith("replace-with-"));
}

export function getConfiguredOAuthProviders(env: Partial<Env>): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (isOAuthProviderConfigured(env, "GOOGLE")) {
    providers.push("GOOGLE");
  }
  if (isOAuthProviderConfigured(env, "MICROSOFT")) {
    providers.push("MICROSOFT");
  }
  return providers;
}

export function getOAuthStateCookie(secret?: string, secure?: boolean) {
  return createCookie("__oauth_state", {
    path: "/",
    httpOnly: true,
    maxAge: 300, // 5 minutes
    sameSite: "lax",
    secure: secure ?? false,
    secrets: secret ? [secret] : undefined,
  });
}

export class DefaultOAuthClient implements OAuthClient {
  constructor(private env: Partial<Env>) {}

  getAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
    if (provider === "GOOGLE") {
      const clientId = this.env.GOOGLE_CLIENT_ID ?? "";
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
        prompt: "select_account",
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    const clientId = this.env.MICROSOFT_CLIENT_ID ?? "";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile User.Read",
      state,
      prompt: "select_account",
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(provider: OAuthProvider, code: string, redirectUri: string): Promise<OAuthProfile> {
    // Non-production test mock hook for automated integration testing
    if (this.env.APP_ENV !== "production" && code.startsWith("mock:")) {
      const parts = code.split(":");
      const email = parts[1] ?? "test@example.com";
      const sub = parts[2] ?? `mock-${provider.toLowerCase()}-sub`;
      return {
        provider,
        providerAccountId: sub,
        email,
      };
    }

    if (provider === "GOOGLE") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: this.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        throw new Error(`Google token exchange failed: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json<{ access_token?: string }>();
      if (!tokenData.access_token) {
        throw new Error("No access_token returned by Google");
      }

      const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        throw new Error(`Google userinfo request failed: ${userRes.status}`);
      }

      const userData = await userRes.json<{ sub?: string; email?: string; email_verified?: boolean }>();
      if (!userData.sub || !userData.email) {
        throw new Error("Missing user profile fields from Google userinfo");
      }

      return {
        provider: "GOOGLE",
        providerAccountId: userData.sub,
        email: userData.email,
      };
    }

    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: this.env.MICROSOFT_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Microsoft token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json<{ access_token?: string }>();
    if (!tokenData.access_token) {
      throw new Error("No access_token returned by Microsoft");
    }

    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error(`Microsoft Graph request failed: ${userRes.status}`);
    }

    const userData = await userRes.json<{ id?: string; mail?: string; userPrincipalName?: string }>();
    const email = userData.mail || userData.userPrincipalName;
    if (!userData.id || !email) {
      throw new Error("Missing user profile fields from Microsoft Graph");
    }

    return {
      provider: "MICROSOFT",
      providerAccountId: userData.id,
      email,
    };
  }
}

export class OAuthStrategy extends Strategy<SessionUser, OAuthProfile> {
  name: string;
  private ctx: RequestContext;
  private provider: OAuthProvider;
  private client: OAuthClient;

  constructor(ctx: RequestContext, provider: OAuthProvider, client?: OAuthClient) {
    super(async (profile: OAuthProfile) => {
      return authService.loginWithOAuth(ctx, profile);
    });
    this.name = provider.toLowerCase();
    this.ctx = ctx;
    this.provider = provider;
    this.client = client ?? ctx.oauthClient ?? new DefaultOAuthClient(ctx.env);
  }

  async authenticate(request: Request): Promise<SessionUser> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const isSecure =
      isRequestSecure(request) || this.ctx.env.APP_ENV === "production" || this.ctx.env.APP_ENV === "staging";
    const cookieHelper = getOAuthStateCookie(this.ctx.env.SESSION_SECRET, isSecure);

    const redirectUri = new URL(`/auth/${this.provider.toLowerCase()}/callback`, url.origin).toString();

    // 1. Authorization initiation (no code in URL)
    if (!code) {
      let redirectTo: string | undefined;
      if (request.method === "POST") {
        try {
          const formData = await request.clone().formData();
          const r = formData.get("redirectTo");
          if (typeof r === "string" && r.length > 0) {
            redirectTo = r;
          }
        } catch {
          // ignore form parsing error
        }
      } else {
        const r = url.searchParams.get("redirectTo");
        if (r) {
          redirectTo = r;
        }
      }

      const newState = crypto.randomUUID();
      const authUrl = this.client.getAuthorizationUrl(this.provider, redirectUri, newState);
      const cookieHeader = await cookieHelper.serialize({ state: newState, redirectTo });

      throw redirect(authUrl, {
        headers: {
          "Set-Cookie": cookieHeader,
        },
      });
    }

    // 2. Authorization callback
    const cookieHeader = request.headers.get("Cookie");
    const savedData = (await cookieHelper.parse(cookieHeader)) as OAuthStateData | null;

    if (!savedData?.state || !state || savedData.state !== state) {
      throw new ValidationError("Authentication failed. Please try again.");
    }

    const profile = await this.client.exchangeCode(this.provider, code, redirectUri);
    return this.verify(profile);
  }
}

export function getAuthenticator(ctx: RequestContext, client?: OAuthClient): Authenticator<SessionUser> {
  const authenticator = new Authenticator<SessionUser>();
  authenticator.use(new OAuthStrategy(ctx, "GOOGLE", client), "google");
  authenticator.use(new OAuthStrategy(ctx, "MICROSOFT", client), "microsoft");
  return authenticator;
}
