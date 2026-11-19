import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { loginAction } from "../../app/actions/loginAction";
import { hashPassword } from "../../app/services/auth/password.server";
import { requireUser } from "../../app/utils/auth.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

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

describe("loginAction", () => {
  it("returns 400 on invalid or missing fields", async () => {
    const ctx = createMockContext();
    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "not-an-email");
    formData.append("password", "");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(400);

    const body = await response.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body.success).toBe(false);
    expect(body.errors.email).toBeDefined();
    expect(body.errors.password).toBeDefined();
  });

  it("returns 400 on unknown intent", async () => {
    const ctx = createMockContext();
    const formData = new FormData();
    formData.append("intent", "unknown_intent");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(400);
    const body = await response.json<{ success: boolean }>();
    expect(body.success).toBe(false);
  });

  it("FR-01 c2: returns 400 on wrong password", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("RealPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "user@example.com",
      fullName: "Real User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "user@example.com");
    formData.append("password", "BadPassword999!");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(400);
    const body = await response.json<{ success: boolean; errors: Record<string, string[]>; email?: string }>();
    expect(body.success).toBe(false);
    expect(body.errors.form).toContain("Email or password is incorrect");
    expect(body.email).toBe("user@example.com");
  });

  it("FR-01 c3: returns 400 on locked user", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("LockedPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "locked@example.com",
      fullName: "Locked Person",
      systemRole: "MEMBER",
      status: "LOCKED",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "locked@example.com");
    formData.append("password", "LockedPassword123!");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(400);
    const body = await response.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body.success).toBe(false);
    expect(body.errors.form).toContain("This account is locked. Contact an administrator.");
  });

  it("FR-01 c1: authenticates and redirects admin to /admin with session cookie", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("AdminPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "admin@example.com",
      fullName: "Super Admin",
      systemRole: "ADMIN",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "admin@example.com");
    formData.append("password", "AdminPassword123!");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin");
    expect(response.headers.get("Set-Cookie")).toContain("__session=");
  });

  it("authenticates member and respects safe redirectTo parameter", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("MemberPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "member@example.com",
      fullName: "Regular Member",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "member@example.com");
    formData.append("password", "MemberPassword123!");
    formData.append("redirectTo", "/projects/sample-123");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/projects/sample-123");
  });

  it("FR-01 c4: ignores unsafe redirectTo parameter and sends member to member home", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("MemberPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "member2@example.com",
      fullName: "Member Two",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "member2@example.com");
    formData.append("password", "MemberPassword123!");
    formData.append("redirectTo", "https://malicious-site.com");

    const request = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const response = await loginAction(ctx, request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  });

  it("authenticates with custom SESSION_SECRET and succeeds in requireUser", async () => {
    const customSecret = "custom-production-secret-at-least-32-chars-long";
    const ctx = createMockContext();
    ctx.env = { ...env, SESSION_SECRET: customSecret };
    const now = new Date();
    const { hash, iterations } = await hashPassword("SecretPassword123!");

    const user = await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "secret-check@example.com",
      fullName: "Secret User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const formData = new FormData();
    formData.append("intent", "login");
    formData.append("email", "secret-check@example.com");
    formData.append("password", "SecretPassword123!");

    const loginReq = new Request("http://localhost/login", {
      method: "POST",
      body: formData,
    });

    const loginRes = await loginAction(ctx, loginReq);
    expect(loginRes.status).toBe(302);
    const cookieHeader = loginRes.headers.get("Set-Cookie");
    expect(cookieHeader).toBeTruthy();

    const protectedReq = new Request("http://localhost/protected", {
      headers: {
        Cookie: cookieHeader ?? "",
      },
    });

    const sessionUser = await requireUser(ctx, protectedReq);
    expect(sessionUser.id).toBe(user.id);
  });
});
