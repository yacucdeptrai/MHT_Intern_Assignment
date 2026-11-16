import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, oauthAccountRepository, userRepository } from "@pm/db";

import { authService } from "../../app/services/auth/auth.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

function createMockContext(): RequestContext {
  return {
    env,
    db: createDatabase(env.DB),
    user: null,
    requestId: "test-oauth-request-id",
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

describe("authService.loginWithOAuth (FR-02)", () => {
  it("FR-02 c1: links oauth account and creates session user for active user", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "google-user@example.com",
      fullName: "Google Test User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const sessionUser = await authService.loginWithOAuth(ctx, {
      provider: "GOOGLE",
      providerAccountId: "google-sub-1001",
      email: "  GOOGLE-USER@EXAMPLE.COM  ",
    });

    expect(sessionUser.id).toBe(id);
    expect(sessionUser.email).toBe("google-user@example.com");
    expect(sessionUser.fullName).toBe("Google Test User");
    expect(sessionUser.systemRole).toBe("MEMBER");
    expect(sessionUser.status).toBe("ACTIVE");

    // Check oauth_accounts table has the linked record
    const linked = await oauthAccountRepository.findByProviderAccount(ctx.db, "GOOGLE", "google-sub-1001");
    expect(linked).toBeDefined();
    expect(linked?.userId).toBe(id);

    // Calling again is idempotent (doesn't throw or create duplicate)
    const secondLogin = await authService.loginWithOAuth(ctx, {
      provider: "GOOGLE",
      providerAccountId: "google-sub-1001",
      email: "google-user@example.com",
    });
    expect(secondLogin.id).toBe(id);
  });

  it("FR-02 c2: refuses sign-in when email does not match any user", async () => {
    const ctx = createMockContext();

    await expect(
      authService.loginWithOAuth(ctx, {
        provider: "MICROSOFT",
        providerAccountId: "ms-sub-2002",
        email: "nonexistent@example.com",
      }),
    ).rejects.toThrow("No account exists for this email. Ask an administrator for an invite.");

    // Verify no user was created
    const foundUser = await userRepository.findByEmail(ctx.db, "nonexistent@example.com");
    expect(foundUser).toBeNull();
  });

  it("FR-02 c2: refuses sign-in when matching user is soft-deleted", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "deleted-oauth@example.com",
      fullName: "Deleted User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      authService.loginWithOAuth(ctx, {
        provider: "GOOGLE",
        providerAccountId: "google-sub-deleted",
        email: "deleted-oauth@example.com",
      }),
    ).rejects.toThrow("No account exists for this email. Ask an administrator for an invite.");
  });

  it("FR-02 c3: refuses sign-in when matching user is locked", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(ctx.db, {
      id,
      email: "locked-oauth@example.com",
      fullName: "Locked User",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      authService.loginWithOAuth(ctx, {
        provider: "MICROSOFT",
        providerAccountId: "ms-sub-locked",
        email: "locked-oauth@example.com",
      }),
    ).rejects.toThrow("This account is locked. Contact an administrator.");
  });
});
