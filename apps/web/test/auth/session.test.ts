import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { getSafeRedirect, requireUser } from "../../app/utils/auth.server";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, destroySession, getSession } from "../../app/utils/session.server";

function createMockContext(): RequestContext {
  return {
    env,
    db: createDatabase(env.DB),
    user: null,
    requestId: "test-request-id",
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

describe("getSafeRedirect", () => {
  it("keeps valid relative paths", () => {
    expect(getSafeRedirect("/admin")).toBe("/admin");
    expect(getSafeRedirect("/projects/123?tab=members")).toBe("/projects/123?tab=members");
  });

  it("falls back to default path for open redirect attempts", () => {
    expect(getSafeRedirect("https://evil.com")).toBe("/");
    expect(getSafeRedirect("//evil.com")).toBe("/");
    expect(getSafeRedirect("javascript:alert(1)")).toBe("/");
    expect(getSafeRedirect(null)).toBe("/");
    expect(getSafeRedirect(undefined, "/admin")).toBe("/admin");
  });
});

describe("session cookie management", () => {
  it("commits, reads, and destroys a session", async () => {
    const session = await getSession();
    session.set("userId", "test-user-id");

    const cookieHeader = await commitSession(session);
    expect(cookieHeader).toContain("__session=");
    expect(cookieHeader).toContain("Max-Age=604800");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Lax");

    const request = new Request("http://localhost/", {
      headers: { Cookie: cookieHeader },
    });
    const loaded = await getSession(request);
    expect(loaded.get("userId")).toBe("test-user-id");

    const destroyHeader = await destroySession(loaded);
    expect(destroyHeader).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });

  it("does not set Secure cookie flag on HTTP even with custom secret", async () => {
    const session = await getSession();
    session.set("userId", "http-user");
    const cookieHeader = await commitSession(session, {
      secret: "custom-production-secret-at-least-32-chars-long",
      secure: false,
    });
    expect(cookieHeader).not.toContain("Secure");
  });

  it("sets Secure cookie flag when secure is explicitly true", async () => {
    const session = await getSession();
    session.set("userId", "https-user");
    const cookieHeader = await commitSession(session, {
      secret: "custom-production-secret-at-least-32-chars-long",
      secure: true,
    });
    expect(cookieHeader).toContain("Secure");
  });
});

describe("requireUser guard", () => {
  it("redirects unauthenticated requests to login with return url", async () => {
    const ctx = createMockContext();
    const request = new Request("http://localhost/protected/resource");

    try {
      await requireUser(ctx, request);
      expect.fail("Expected requireUser to throw redirect");
    } catch (response: unknown) {
      expect(response).toBeInstanceOf(Response);
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.get("Location") ?? "")).toBe("/login?redirectTo=/protected/resource");
    }
  });

  it("returns active user when session is valid", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "active.user@example.com",
      fullName: "Active User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const session = await getSession(null, ctx.env.SESSION_SECRET);
    session.set("userId", id);
    const cookie = await commitSession(session, ctx.env.SESSION_SECRET);

    const request = new Request("http://localhost/protected", {
      headers: { Cookie: cookie },
    });

    const user = await requireUser(ctx, request);
    expect(user.id).toBe(id);
    expect(user.email).toBe("active.user@example.com");
    expect(user.systemRole).toBe("MEMBER");
    expect(user.status).toBe("ACTIVE");
  });

  it("clears session and redirects to login when user is locked", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "locked.user@example.com",
      fullName: "Locked User",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: now,
      updatedAt: now,
    });

    const session = await getSession(null, ctx.env.SESSION_SECRET);
    session.set("userId", id);
    const cookie = await commitSession(session, ctx.env.SESSION_SECRET);

    const request = new Request("http://localhost/protected", {
      headers: { Cookie: cookie },
    });

    try {
      await requireUser(ctx, request);
      expect.fail("Expected requireUser to throw redirect for locked user");
    } catch (response: unknown) {
      expect(response).toBeInstanceOf(Response);
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
      expect(res.headers.get("Set-Cookie")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    }
  });

  it("clears session and redirects to login when user is deleted", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "deleted.user@example.com",
      fullName: "Deleted User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const session = await getSession(null, ctx.env.SESSION_SECRET);
    session.set("userId", id);
    const cookie = await commitSession(session, ctx.env.SESSION_SECRET);

    const request = new Request("http://localhost/protected", {
      headers: { Cookie: cookie },
    });

    try {
      await requireUser(ctx, request);
      expect.fail("Expected requireUser to throw redirect for deleted user");
    } catch (response: unknown) {
      expect(response).toBeInstanceOf(Response);
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
      expect(res.headers.get("Set-Cookie")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    }
  });
});
