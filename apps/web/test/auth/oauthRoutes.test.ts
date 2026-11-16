import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, oauthAccountRepository, userRepository } from "@pm/db";
import type { OAuthClient, OAuthProfile, OAuthProvider } from "@pm/domain";

import { loginLoader } from "../../app/loaders/loginLoader";
import { action as authStartAction, loader as authStartLoader } from "../../app/routes/auth.$provider";
import { loader as authCallbackLoader } from "../../app/routes/auth.$provider.callback";
import { getOAuthStateCookie, isOAuthProviderConfigured } from "../../app/services/auth/oauth.server";
import { requestContextKey, type RequestContext } from "../../app/utils/requestContext.server";
import { getSession } from "../../app/utils/session.server";

class MockTestOAuthClient implements OAuthClient {
  public authUrls: Record<string, string> = {
    GOOGLE: "https://accounts.google.com/test-auth",
    MICROSOFT: "https://login.microsoftonline.com/test-auth",
  };

  public profiles: Record<string, OAuthProfile> = {};

  getAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
    const base = this.authUrls[provider] ?? "https://example.com/oauth";
    return `${base}?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    const profile = this.profiles[code];
    if (profile) {
      return Promise.resolve(profile);
    }
    return Promise.resolve({
      provider,
      providerAccountId: `test-sub-${code}`,
      email: `${code}@example.com`,
    });
  }
}

function createMockContext(overrides?: Partial<Env>, mockClient?: OAuthClient): RequestContext {
  const mergedEnv: Env = {
    ...env,
    ...overrides,
  };

  return {
    env: mergedEnv,
    db: createDatabase(env.DB),
    user: null,
    oauthClient: mockClient,
    requestId: "test-oauth-routes",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };
}

function makeRouteArgs(ctx: RequestContext, params: Record<string, string>, request: Request) {
  const contextMap = new Map();
  contextMap.set(requestContextKey, ctx);
  return {
    context: contextMap,
    params,
    request,
  };
}

describe("OAuth routes and login loader (FR-02)", () => {
  describe("loginLoader (FR-02 c4)", () => {
    it("hides provider buttons when credentials are missing or placeholders", async () => {
      const ctx = createMockContext({
        GOOGLE_CLIENT_ID: "replace-with-google-client-id",
        GOOGLE_CLIENT_SECRET: "replace-with-google-secret",
        MICROSOFT_CLIENT_ID: "",
        MICROSOFT_CLIENT_SECRET: "",
      });

      const request = new Request("http://localhost:5173/login");
      const data = await loginLoader(ctx, request);

      expect(data.ssoProviders).toEqual([]);
      expect(isOAuthProviderConfigured(ctx.env, "GOOGLE")).toBe(false);
      expect(isOAuthProviderConfigured(ctx.env, "MICROSOFT")).toBe(false);
    });

    it("surfaces provider buttons when credentials are validly configured", async () => {
      const ctx = createMockContext({
        GOOGLE_CLIENT_ID: "real-google-id.apps.google.com",
        GOOGLE_CLIENT_SECRET: "real-google-secret",
        MICROSOFT_CLIENT_ID: "real-ms-id",
        MICROSOFT_CLIENT_SECRET: "real-ms-secret",
      });

      const request = new Request("http://localhost:5173/login");
      const data = await loginLoader(ctx, request);

      expect(data.ssoProviders).toEqual(["GOOGLE", "MICROSOFT"]);
      expect(data.ssoError).toBeNull();
    });

    it("parses error query params into user-facing alerts", async () => {
      const ctx = createMockContext();

      const reqNoAccount = new Request("http://localhost:5173/login?error=no_account");
      const dataNoAccount = await loginLoader(ctx, reqNoAccount);
      expect(dataNoAccount.ssoError).toBe("No account exists for this email. Ask an administrator for an invite.");

      const reqLocked = new Request("http://localhost:5173/login?error=locked");
      const dataLocked = await loginLoader(ctx, reqLocked);
      expect(dataLocked.ssoError).toBe("This account is locked. Contact an administrator.");

      const reqFailed = new Request("http://localhost:5173/login?error=failed");
      const dataFailed = await loginLoader(ctx, reqFailed);
      expect(dataFailed.ssoError).toBe("Authentication failed. Please try again.");
    });
  });

  describe("auth.$provider.tsx (/auth/:provider)", () => {
    it("returns 404 for unknown provider", async () => {
      const ctx = createMockContext({
        GOOGLE_CLIENT_ID: "configured-id",
        GOOGLE_CLIENT_SECRET: "configured-secret",
      });
      const request = new Request("http://localhost:5173/auth/github", { method: "POST" });
      const args = makeRouteArgs(ctx, { provider: "github" }, request) as unknown as Parameters<
        typeof authStartAction
      >[0];

      const response = await authStartAction(args);
      expect(response.status).toBe(404);
    });

    it("returns 404 when provider is not configured (FR-02 c4)", async () => {
      const ctx = createMockContext({
        GOOGLE_CLIENT_ID: "replace-with-google-client-id",
        GOOGLE_CLIENT_SECRET: "replace-with-google-secret",
      });
      const request = new Request("http://localhost:5173/auth/google", { method: "POST" });
      const args = makeRouteArgs(ctx, { provider: "google" }, request) as unknown as Parameters<
        typeof authStartAction
      >[0];

      const response = await authStartAction(args);
      expect(response.status).toBe(404);
    });

    it("redirects to OAuth provider and sets state cookie when configured", async () => {
      const mockClient = new MockTestOAuthClient();
      const ctx = createMockContext(
        {
          GOOGLE_CLIENT_ID: "valid-client-id",
          GOOGLE_CLIENT_SECRET: "valid-client-secret",
        },
        mockClient,
      );

      const formData = new FormData();
      formData.append("redirectTo", "/projects");
      const request = new Request("http://localhost:5173/auth/google", {
        method: "POST",
        body: formData,
      });
      const args = makeRouteArgs(ctx, { provider: "google" }, request) as unknown as Parameters<
        typeof authStartAction
      >[0];

      let caughtResponse: Response | null = null;
      try {
        await authStartAction(args);
      } catch (err) {
        if (err instanceof Response) {
          caughtResponse = err;
        }
      }

      expect(caughtResponse).not.toBeNull();
      expect(caughtResponse?.status).toBe(302);
      const location = caughtResponse?.headers.get("Location");
      expect(location).toContain("https://accounts.google.com/test-auth");
      expect(location).toContain("state=");

      const setCookie = caughtResponse?.headers.get("Set-Cookie");
      expect(setCookie).toContain("__oauth_state=");
    });

    it("supports GET loader for OAuth initiation", async () => {
      const mockClient = new MockTestOAuthClient();
      const ctx = createMockContext(
        {
          MICROSOFT_CLIENT_ID: "valid-ms-id",
          MICROSOFT_CLIENT_SECRET: "valid-ms-secret",
        },
        mockClient,
      );

      const request = new Request("http://localhost:5173/auth/microsoft?redirectTo=/tasks");
      const args = makeRouteArgs(ctx, { provider: "microsoft" }, request) as unknown as Parameters<
        typeof authStartLoader
      >[0];

      let caughtResponse: Response | null = null;
      try {
        await authStartLoader(args);
      } catch (err) {
        if (err instanceof Response) {
          caughtResponse = err;
        }
      }

      expect(caughtResponse).not.toBeNull();
      expect(caughtResponse?.status).toBe(302);
      expect(caughtResponse?.headers.get("Location")).toContain("https://login.microsoftonline.com/test-auth");
    });
  });

  describe("auth.$provider.callback.tsx (/auth/:provider/callback)", () => {
    it("returns 404 when provider is not configured (FR-02 c4)", async () => {
      const ctx = createMockContext({
        GOOGLE_CLIENT_ID: "replace-with-google",
        GOOGLE_CLIENT_SECRET: "",
      });
      const request = new Request("http://localhost:5173/auth/google/callback?code=123&state=abc");
      const args = makeRouteArgs(ctx, { provider: "google" }, request) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const response = await authCallbackLoader(args);
      expect(response.status).toBe(404);
    });

    it("redirects to /login?error=failed when state cookie is missing or mismatched", async () => {
      const mockClient = new MockTestOAuthClient();
      const ctx = createMockContext(
        {
          GOOGLE_CLIENT_ID: "valid-id",
          GOOGLE_CLIENT_SECRET: "valid-secret",
        },
        mockClient,
      );

      // Request with state=abc but no cookie
      const requestNoCookie = new Request("http://localhost:5173/auth/google/callback?code=123&state=abc");
      const argsNoCookie = makeRouteArgs(ctx, { provider: "google" }, requestNoCookie) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const resNoCookie = await authCallbackLoader(argsNoCookie);
      expect(resNoCookie.status).toBe(302);
      expect(resNoCookie.headers.get("Location")).toBe("/login?error=failed");

      // Request with mismatched cookie
      const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET);
      const cookieVal = await cookieHelper.serialize({ state: "expected-state" });
      const requestMismatch = new Request("http://localhost:5173/auth/google/callback?code=123&state=wrong-state", {
        headers: { Cookie: cookieVal },
      });
      const argsMismatch = makeRouteArgs(ctx, { provider: "google" }, requestMismatch) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const resMismatch = await authCallbackLoader(argsMismatch);
      expect(resMismatch.status).toBe(302);
      expect(resMismatch.headers.get("Location")).toBe("/login?error=failed");
    });

    it("FR-02 c2: redirects to /login?error=no_account when email matches no user", async () => {
      const mockClient = new MockTestOAuthClient();
      mockClient.profiles["code-no-user"] = {
        provider: "GOOGLE",
        providerAccountId: "google-sub-missing",
        email: "unknown-person@example.com",
      };

      const ctx = createMockContext(
        {
          GOOGLE_CLIENT_ID: "valid-id",
          GOOGLE_CLIENT_SECRET: "valid-secret",
        },
        mockClient,
      );

      const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET);
      const cookieVal = await cookieHelper.serialize({ state: "valid-state" });
      const request = new Request("http://localhost:5173/auth/google/callback?code=code-no-user&state=valid-state", {
        headers: { Cookie: cookieVal },
      });
      const args = makeRouteArgs(ctx, { provider: "google" }, request) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const response = await authCallbackLoader(args);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/login?error=no_account");
    });

    it("FR-02 c3: redirects to /login?error=locked when user is locked", async () => {
      const mockClient = new MockTestOAuthClient();
      mockClient.profiles["code-locked"] = {
        provider: "MICROSOFT",
        providerAccountId: "ms-sub-locked",
        email: "locked-user@example.com",
      };

      const ctx = createMockContext(
        {
          MICROSOFT_CLIENT_ID: "valid-ms-id",
          MICROSOFT_CLIENT_SECRET: "valid-ms-secret",
        },
        mockClient,
      );

      const now = new Date();
      await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "locked-user@example.com",
        fullName: "Locked Member",
        systemRole: "MEMBER",
        status: "LOCKED",
        createdAt: now,
        updatedAt: now,
      });

      const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET);
      const cookieVal = await cookieHelper.serialize({ state: "ms-state" });
      const request = new Request("http://localhost:5173/auth/microsoft/callback?code=code-locked&state=ms-state", {
        headers: { Cookie: cookieVal },
      });
      const args = makeRouteArgs(ctx, { provider: "microsoft" }, request) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const response = await authCallbackLoader(args);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/login?error=locked");
    });

    it("FR-02 c1: successfully logs in active member, links account, creates session, and redirects to member home", async () => {
      const mockClient = new MockTestOAuthClient();
      mockClient.profiles["code-member"] = {
        provider: "GOOGLE",
        providerAccountId: "google-sub-active-member",
        email: "member-oauth@example.com",
      };

      const ctx = createMockContext(
        {
          GOOGLE_CLIENT_ID: "valid-id",
          GOOGLE_CLIENT_SECRET: "valid-secret",
        },
        mockClient,
      );

      const now = new Date();
      const member = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "member-oauth@example.com",
        fullName: "Active Member",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });

      const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET);
      const cookieVal = await cookieHelper.serialize({ state: "active-state" });
      const request = new Request("http://localhost:5173/auth/google/callback?code=code-member&state=active-state", {
        headers: { Cookie: cookieVal },
      });
      const args = makeRouteArgs(ctx, { provider: "google" }, request) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const response = await authCallbackLoader(args);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");

      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders.some((c) => c.includes("__session="))).toBe(true);
      expect(setCookieHeaders.some((c) => c.includes("__oauth_state="))).toBe(true);

      // Verify session contains userId
      const sessionCookie = setCookieHeaders.find((c) => c.includes("__session=")) ?? "";
      const session = await getSession(
        new Request("http://localhost/", { headers: { Cookie: sessionCookie } }),
        ctx.env.SESSION_SECRET,
      );
      expect(session.get("userId")).toBe(member.id);

      // Verify oauth_accounts has linked row
      const linked = await oauthAccountRepository.findByProviderAccount(ctx.db, "GOOGLE", "google-sub-active-member");
      expect(linked).toBeDefined();
      expect(linked?.userId).toBe(member.id);
    });

    it("FR-02 c1: successfully logs in admin, redirects to /admin or safe redirectTo", async () => {
      const mockClient = new MockTestOAuthClient();
      mockClient.profiles["code-admin"] = {
        provider: "MICROSOFT",
        providerAccountId: "ms-sub-admin",
        email: "admin-oauth@example.com",
      };

      const ctx = createMockContext(
        {
          MICROSOFT_CLIENT_ID: "valid-ms-id",
          MICROSOFT_CLIENT_SECRET: "valid-ms-secret",
        },
        mockClient,
      );

      const now = new Date();
      await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "admin-oauth@example.com",
        fullName: "Admin Member",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });

      // 1. With no custom redirectTo -> goes to /admin
      const cookieHelper = getOAuthStateCookie(ctx.env.SESSION_SECRET);
      const cookieVal = await cookieHelper.serialize({ state: "admin-state" });
      const request = new Request("http://localhost:5173/auth/microsoft/callback?code=code-admin&state=admin-state", {
        headers: { Cookie: cookieVal },
      });
      const args = makeRouteArgs(ctx, { provider: "microsoft" }, request) as unknown as Parameters<
        typeof authCallbackLoader
      >[0];

      const response = await authCallbackLoader(args);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/admin");

      // 2. With safe redirectTo -> goes to /admin/users
      const cookieWithRedirect = await cookieHelper.serialize({
        state: "admin-state-2",
        redirectTo: "/admin/users",
      });
      const requestWithRedirect = new Request(
        "http://localhost:5173/auth/microsoft/callback?code=code-admin&state=admin-state-2",
        {
          headers: { Cookie: cookieWithRedirect },
        },
      );
      const argsWithRedirect = makeRouteArgs(
        ctx,
        { provider: "microsoft" },
        requestWithRedirect,
      ) as unknown as Parameters<typeof authCallbackLoader>[0];

      const responseWithRedirect = await authCallbackLoader(argsWithRedirect);
      expect(responseWithRedirect.status).toBe(302);
      expect(responseWithRedirect.headers.get("Location")).toBe("/admin/users");
    });
  });
});
