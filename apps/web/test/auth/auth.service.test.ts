import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { ValidationError } from "@pm/domain";
import { authService } from "../../app/services/auth/auth.service";
import { hashPassword } from "../../app/services/auth/password.server";
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

describe("authService.loginWithPassword", () => {
  it("authenticates active user and supports case-insensitive email", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();
    const { hash, iterations } = await hashPassword("ValidPassword123!");

    await userRepository.insert(ctx.db, {
      id,
      email: "alice@example.com",
      fullName: "Alice Wonderland",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    const user = await authService.loginWithPassword(ctx, {
      email: "  ALICE@EXAMPLE.COM  ",
      password: "ValidPassword123!",
    });

    expect(user.id).toBe(id);
    expect(user.email).toBe("alice@example.com");
    expect(user.fullName).toBe("Alice Wonderland");
  });

  it("re-hashes password when stored iterations are below default", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const id = crypto.randomUUID();
    // 10,000 iterations is below PBKDF2_DEFAULT_ITERATIONS (100,000)
    const { hash } = await hashPassword("RehashMe123!", 10_000);

    await userRepository.insert(ctx.db, {
      id,
      email: "rehash@example.com",
      fullName: "Rehash User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: 10_000,
      createdAt: now,
      updatedAt: now,
    });

    await authService.loginWithPassword(ctx, {
      email: "rehash@example.com",
      password: "RehashMe123!",
    });

    const updated = await userRepository.findById(ctx.db, id);
    expect(updated?.passwordIterations).toBe(100_000);
    expect(updated?.passwordHash).not.toBe(hash);
  });

  it("rejects unknown email with generic message", async () => {
    const ctx = createMockContext();

    await expect(
      authService.loginWithPassword(ctx, {
        email: "nobody@example.com",
        password: "any-password",
      }),
    ).rejects.toThrow(new ValidationError("Email or password is incorrect"));
  });

  it("rejects wrong password with generic message", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("CorrectPass123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "user@example.com",
      fullName: "Test User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      authService.loginWithPassword(ctx, {
        email: "user@example.com",
        password: "WrongPassword999!",
      }),
    ).rejects.toThrow(new ValidationError("Email or password is incorrect"));
  });

  it("rejects locked user with explicit locked message", async () => {
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

    await expect(
      authService.loginWithPassword(ctx, {
        email: "locked@example.com",
        password: "LockedPassword123!",
      }),
    ).rejects.toThrow(new ValidationError("This account is locked. Contact an administrator."));
  });

  it("does not reveal locked status when the password is wrong", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("LockedPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "locked.wrong@example.com",
      fullName: "Locked Wrong",
      systemRole: "MEMBER",
      status: "LOCKED",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      authService.loginWithPassword(ctx, {
        email: "locked.wrong@example.com",
        password: "WrongPassword999!",
      }),
    ).rejects.toThrow(new ValidationError("Email or password is incorrect"));
  });

  it("rejects deleted user with correct credentials using the locked message", async () => {
    const ctx = createMockContext();
    const now = new Date();
    const { hash, iterations } = await hashPassword("DeletedPassword123!");

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "deleted@example.com",
      fullName: "Deleted Person",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    await expect(
      authService.loginWithPassword(ctx, {
        email: "deleted@example.com",
        password: "DeletedPassword123!",
      }),
    ).rejects.toThrow(new ValidationError("This account is locked. Contact an administrator."));

    await expect(
      authService.loginWithPassword(ctx, {
        email: "deleted@example.com",
        password: "WrongPassword999!",
      }),
    ).rejects.toThrow(new ValidationError("Email or password is incorrect"));
  });

  it("rejects user with no password hash (SSO only)", async () => {
    const ctx = createMockContext();
    const now = new Date();

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "sso.only@example.com",
      fullName: "SSO Only",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: null,
      passwordIterations: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      authService.loginWithPassword(ctx, {
        email: "sso.only@example.com",
        password: "AnyPassword123!",
      }),
    ).rejects.toThrow(new ValidationError("Email or password is incorrect"));
  });
});

describe("authService.seedAdminUser", () => {
  it("creates admin user if none exists", async () => {
    const ctx = createMockContext();

    await authService.seedAdminUser(ctx);

    const hasAdmin = await userRepository.hasAdminUser(ctx.db);
    expect(hasAdmin).toBe(true);

    const admin = await userRepository.findByEmail(ctx.db, env.ADMIN_SEED_EMAIL);
    expect(admin).toBeDefined();
    expect(admin?.systemRole).toBe("ADMIN");
    expect(admin?.status).toBe("ACTIVE");
  });
});
