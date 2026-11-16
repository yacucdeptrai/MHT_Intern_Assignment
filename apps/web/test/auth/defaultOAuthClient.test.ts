import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultOAuthClient } from "../../app/services/auth/oauth.server";

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe("DefaultOAuthClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds correct Google and Microsoft authorization URLs", () => {
    const client = new DefaultOAuthClient({
      GOOGLE_CLIENT_ID: "google-test-id",
      MICROSOFT_CLIENT_ID: "ms-test-id",
    });

    const googleUrl = client.getAuthorizationUrl("GOOGLE", "http://localhost/callback", "state123");
    expect(googleUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(googleUrl).toContain("client_id=google-test-id");
    expect(googleUrl).toContain("state=state123");

    const msUrl = client.getAuthorizationUrl("MICROSOFT", "http://localhost/callback", "state456");
    expect(msUrl).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(msUrl).toContain("client_id=ms-test-id");
    expect(msUrl).toContain("state=state456");
  });

  it("exchanges mock code in non-production environment", async () => {
    const client = new DefaultOAuthClient({
      APP_ENV: "local",
    });

    const profile = await client.exchangeCode("GOOGLE", "mock:alice@example.com:sub999", "http://localhost/callback");
    expect(profile.provider).toBe("GOOGLE");
    expect(profile.email).toBe("alice@example.com");
    expect(profile.providerAccountId).toBe("sub999");
  });

  describe("Google OAuth token exchange", () => {
    it("successfully exchanges code and retrieves userinfo", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
        GOOGLE_CLIENT_ID: "g-id",
        GOOGLE_CLIENT_SECRET: "g-secret",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-google-token" }), { status: 200 }));
        }
        if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
          return Promise.resolve(
            new Response(JSON.stringify({ sub: "google-sub-1", email: "guser@example.com", email_verified: true }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      });

      const profile = await client.exchangeCode("GOOGLE", "real-code-123", "http://localhost/callback");
      expect(profile.provider).toBe("GOOGLE");
      expect(profile.providerAccountId).toBe("google-sub-1");
      expect(profile.email).toBe("guser@example.com");
    });

    it("throws when Google token endpoint fails", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 400 }));
      await expect(client.exchangeCode("GOOGLE", "code-fail", "http://localhost/callback")).rejects.toThrow(
        "Google token exchange failed: 400",
      );
    });

    it("throws when Google returns no access_token", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      await expect(client.exchangeCode("GOOGLE", "code-no-token", "http://localhost/callback")).rejects.toThrow(
        "No access_token returned by Google",
      );
    });

    it("throws when Google userinfo endpoint fails", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
        }
        return Promise.resolve(new Response("Unauthorized", { status: 401 }));
      });

      await expect(client.exchangeCode("GOOGLE", "code-user-fail", "http://localhost/callback")).rejects.toThrow(
        "Google userinfo request failed: 401",
      );
    });

    it("throws when Google userinfo is missing required fields", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ sub: "sub-only" }), { status: 200 }));
      });

      await expect(client.exchangeCode("GOOGLE", "code-missing-fields", "http://localhost/callback")).rejects.toThrow(
        "Missing user profile fields from Google userinfo",
      );
    });
  });

  describe("Microsoft OAuth token exchange", () => {
    it("successfully exchanges code and retrieves Microsoft Graph profile", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
        MICROSOFT_CLIENT_ID: "ms-id",
        MICROSOFT_CLIENT_SECRET: "ms-secret",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("login.microsoftonline.com")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "mock-ms-token" }), { status: 200 }));
        }
        if (url.includes("graph.microsoft.com")) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "ms-id-123", mail: "msuser@example.com" }), { status: 200 }),
          );
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      });

      const profile = await client.exchangeCode("MICROSOFT", "ms-code-123", "http://localhost/callback");
      expect(profile.provider).toBe("MICROSOFT");
      expect(profile.providerAccountId).toBe("ms-id-123");
      expect(profile.email).toBe("msuser@example.com");
    });

    it("throws when Microsoft token endpoint fails", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));
      await expect(client.exchangeCode("MICROSOFT", "code-fail", "http://localhost/callback")).rejects.toThrow(
        "Microsoft token exchange failed: 500",
      );
    });

    it("throws when Microsoft returns no access_token", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      await expect(client.exchangeCode("MICROSOFT", "code-no-token", "http://localhost/callback")).rejects.toThrow(
        "No access_token returned by Microsoft",
      );
    });

    it("throws when Microsoft Graph endpoint fails", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("login.microsoftonline.com")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
        }
        return Promise.resolve(new Response("Forbidden", { status: 403 }));
      });

      await expect(client.exchangeCode("MICROSOFT", "code-graph-fail", "http://localhost/callback")).rejects.toThrow(
        "Microsoft Graph request failed: 403",
      );
    });

    it("throws when Microsoft Graph profile has no email or ID", async () => {
      const client = new DefaultOAuthClient({
        APP_ENV: "production",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = getUrl(input);
        if (url.includes("login.microsoftonline.com")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ displayName: "No ID or mail" }), { status: 200 }));
      });

      await expect(
        client.exchangeCode("MICROSOFT", "code-missing-fields", "http://localhost/callback"),
      ).rejects.toThrow("Missing user profile fields from Microsoft Graph");
    });
  });
});
