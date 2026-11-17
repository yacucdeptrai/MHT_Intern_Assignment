import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, inviteRepository, userRepository } from "@pm/db";
import { ValidationError } from "@pm/domain";

import { inviteService } from "../../app/services/invite.service";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { verifyPassword } from "../../app/services/auth/password.server";

describe("invite.service", () => {
  const db = createDatabase(env.DB);

  async function createTestContext(now: Date = new Date()): Promise<RequestContext> {
    const actorId = crypto.randomUUID();
    const email = `admin-${actorId}@example.com`;
    await userRepository.insert(db, {
      id: actorId,
      email,
      fullName: "Admin Actor",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    return {
      env,
      db,
      user: {
        id: actorId,
        email,
        fullName: "Admin Actor",
        systemRole: "ADMIN",
        status: "ACTIVE",
      },
      requestId: "test-req",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      clock: { now: () => now },
      waitUntil: () => {},
    };
  }

  it("createInvite inserts invite and outbox job in atomic batch A7", async () => {
    const now = new Date();
    const ctx = await createTestContext(now);

    const result = await inviteService.createInvite(ctx, {
      email: "newemployee@example.com",
    });

    expect(result.inviteId).toBeDefined();
    expect(result.inviteToken).toHaveLength(64);
    expect(result.inviteUrl).toContain(`/invite/${result.inviteToken}`);

    // Verify invite in db
    const invite = await inviteRepository.findById(db, result.inviteId);
    expect(invite).toBeDefined();
    expect(invite?.email).toBe("newemployee@example.com");
    expect(invite?.acceptedAt).toBeNull();
    expect(invite?.tokenHash).toBeDefined();

    // Verify outbox job
    const jobs = await db.query.outboxJobs.findMany({
      where: (t, { eq }) => eq(t.type, "EMAIL_INVITE"),
    });
    const job = jobs.find((j) => j.payload.includes(result.inviteId));
    expect(job).toBeDefined();
    expect(["PENDING", "RUNNING", "DONE"]).toContain(job?.status);
  });

  it("validateToken checks token validity, expiration, and acceptance", async () => {
    const now = new Date();
    const ctx = await createTestContext(now);

    const created = await inviteService.createInvite(ctx, {
      email: "validatetoken@example.com",
    });

    // 1. Valid token
    const validRes = await inviteService.validateToken(ctx, created.inviteToken);
    expect(validRes.status).toBe("valid");
    expect(validRes.email).toBe("validatetoken@example.com");

    // 2. Non-existent token
    const nonExistent = await inviteService.validateToken(
      ctx,
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(nonExistent.status).toBe("invalid");

    // 3. Empty or malformed token
    const emptyRes = await inviteService.validateToken(ctx, "");
    expect(emptyRes.status).toBe("invalid");

    // 4. Expired token
    const past = new Date(now.getTime() + 1000000000);
    const expiredRes = await inviteService.validateToken({ db, clock: { now: () => past } }, created.inviteToken);
    expect(expiredRes.status).toBe("invalid");
  });

  it("acceptInvite sets password, creates active user, and marks invite accepted (A8)", async () => {
    const now = new Date();
    const ctx = await createTestContext(now);

    const created = await inviteService.createInvite(ctx, {
      email: "acceptnew@example.com",
    });

    const sessionUser = await inviteService.acceptInvite(ctx, created.inviteToken, "SecurePass123!");
    expect(sessionUser.email).toBe("acceptnew@example.com");
    expect(sessionUser.systemRole).toBe("MEMBER");
    expect(sessionUser.status).toBe("ACTIVE");

    // Check user was created in db
    const userInDb = await userRepository.findByEmail(db, "acceptnew@example.com");
    expect(userInDb).toBeDefined();
    expect(userInDb?.passwordHash).toBeDefined();
    expect(userInDb?.passwordIterations).toBeDefined();

    if (!userInDb || !userInDb.passwordHash || !userInDb.passwordIterations) {
      throw new Error("User or password hash not found in database");
    }

    const isMatch = await verifyPassword("SecurePass123!", {
      hash: userInDb.passwordHash,
      iterations: userInDb.passwordIterations,
    });
    expect(isMatch).toBe(true);

    // Invite is now accepted
    const invite = await inviteRepository.findById(db, created.inviteId);
    expect(invite?.acceptedAt).toBeDefined();

    // Re-validation returns invalid
    const reval = await inviteService.validateToken(ctx, created.inviteToken);
    expect(reval.status).toBe("invalid");

    // Second accept attempt throws ValidationError
    await expect(inviteService.acceptInvite(ctx, created.inviteToken, "AnotherPass123!")).rejects.toThrow(
      ValidationError,
    );
  });

  it("acceptInvite updates existing user record when user was pre-created", async () => {
    const now = new Date();
    const ctx = await createTestContext(now);
    const preExistingId = crypto.randomUUID();

    await userRepository.insert(db, {
      id: preExistingId,
      email: "precreated@example.com",
      fullName: "Pre Created User",
      systemRole: "TEAM_LEAD",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const created = await inviteService.createInvite(ctx, {
      email: "precreated@example.com",
    });

    const sessionUser = await inviteService.acceptInvite(ctx, created.inviteToken, "NewPass123456!");
    expect(sessionUser.id).toBe(preExistingId);
    expect(sessionUser.systemRole).toBe("TEAM_LEAD");
    expect(sessionUser.status).toBe("ACTIVE");

    const updatedUser = await userRepository.findById(db, preExistingId);
    expect(updatedUser?.status).toBe("ACTIVE");
    expect(updatedUser?.passwordHash).toBeDefined();
  });
});
