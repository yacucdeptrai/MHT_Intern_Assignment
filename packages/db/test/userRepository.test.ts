import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import { userRepository } from "../src/repositories/user.repository";

describe("userRepository", () => {
  it("inserts and finds a user by id and email", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const id = crypto.randomUUID();

    const created = await userRepository.insert(db, {
      id,
      email: "jane.doe@example.com",
      fullName: "Jane Doe",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "salt.hash",
      passwordIterations: 100_000,
      createdAt: now,
      updatedAt: now,
    });

    expect(created.id).toBe(id);
    expect(created.email).toBe("jane.doe@example.com");

    const foundById = await userRepository.findById(db, id);
    expect(foundById?.fullName).toBe("Jane Doe");

    // Case-insensitive email lookup
    const foundByEmail = await userRepository.findByEmail(db, "JANE.DOE@EXAMPLE.COM");
    expect(foundByEmail?.id).toBe(id);
  });

  it("filters soft-deleted users by default unless includeDeleted is true", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(db, {
      id,
      email: "deleted@example.com",
      fullName: "Deleted User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const activeCheck = await userRepository.findById(db, id);
    expect(activeCheck).toBeNull();

    const activeEmailCheck = await userRepository.findByEmail(db, "deleted@example.com");
    expect(activeEmailCheck).toBeNull();

    const withDeleted = await userRepository.findById(db, id, { includeDeleted: true });
    expect(withDeleted?.id).toBe(id);

    const withDeletedEmail = await userRepository.findByEmail(db, "deleted@example.com", {
      includeDeleted: true,
    });
    expect(withDeletedEmail?.id).toBe(id);
  });

  it("checks whether an admin user exists", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    const hasAdminInitial = await userRepository.hasAdminUser(db);
    expect(hasAdminInitial).toBe(false);

    await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "admin@example.com",
      fullName: "Admin User",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const hasAdminAfter = await userRepository.hasAdminUser(db);
    expect(hasAdminAfter).toBe(true);
  });

  it("updates user password and iterations", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const id = crypto.randomUUID();

    await userRepository.insert(db, {
      id,
      email: "rehash@example.com",
      fullName: "Rehash User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "old-salt.old-hash",
      passwordIterations: 10_000,
      createdAt: now,
      updatedAt: now,
    });

    const later = new Date(now.getTime() + 5000);
    await userRepository.updatePassword(db, id, "new-salt.new-hash", 100_000, later);

    const updated = await userRepository.findById(db, id);
    expect(updated?.passwordHash).toBe("new-salt.new-hash");
    expect(updated?.passwordIterations).toBe(100_000);
    expect(updated?.updatedAt.getTime()).toBe(later.getTime());
  });
});
