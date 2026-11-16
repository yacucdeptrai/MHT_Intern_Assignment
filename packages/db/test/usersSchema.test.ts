import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import { users } from "../src/schema";

describe("users table schema and constraints", () => {
  it("inserts and selects an active user", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: "alice@example.com",
      fullName: "Alice Smith",
      systemRole: "ADMIN",
      status: "ACTIVE",
      passwordHash: "c2FsdA==.aGFzaA==",
      passwordIterations: 100_000,
      createdAt: now,
      updatedAt: now,
    });

    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, id),
    });

    expect(user).toBeDefined();
    expect(user?.email).toBe("alice@example.com");
    expect(user?.fullName).toBe("Alice Smith");
    expect(user?.systemRole).toBe("ADMIN");
    expect(user?.status).toBe("ACTIVE");
    expect(user?.passwordIterations).toBe(100_000);
  });

  it("enforces case-insensitive email uniqueness", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    await db.insert(users).values({
      id: crypto.randomUUID(),
      email: "bob@example.com",
      fullName: "Bob Jones",
      createdAt: now,
      updatedAt: now,
    });

    const duplicateInsert = db.insert(users).values({
      id: crypto.randomUUID(),
      email: "BOB@EXAMPLE.COM",
      fullName: "Bob Copy",
      createdAt: now,
      updatedAt: now,
    });

    await expect(duplicateInsert).rejects.toThrow();
  });

  it("enforces password hash and iterations check constraint parity", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    // passwordHash present, iterations null -> fails
    const invalid1 = db.insert(users).values({
      id: crypto.randomUUID(),
      email: "charles@example.com",
      fullName: "Charles",
      passwordHash: "hash-only",
      passwordIterations: null,
      createdAt: now,
      updatedAt: now,
    });
    await expect(invalid1).rejects.toThrow();

    // passwordHash null, iterations present -> fails
    const invalid2 = db.insert(users).values({
      id: crypto.randomUUID(),
      email: "dan@example.com",
      fullName: "Dan",
      passwordHash: null,
      passwordIterations: 100_000,
      createdAt: now,
      updatedAt: now,
    });
    await expect(invalid2).rejects.toThrow();
  });
});
