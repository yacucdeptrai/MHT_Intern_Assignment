import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import { oauthAccountRepository, userRepository } from "../src/index";

describe("OAuthAccount repository and schema", () => {
  it("inserts and queries oauth account by provider and providerAccountId", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "oauth-user@example.com",
      fullName: "OAuth User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const account = await oauthAccountRepository.insert(db, {
      id: crypto.randomUUID(),
      userId: user.id,
      provider: "GOOGLE",
      providerAccountId: "google-sub-12345",
      createdAt: now,
    });

    expect(account.id).toBeDefined();
    expect(account.userId).toBe(user.id);
    expect(account.provider).toBe("GOOGLE");
    expect(account.providerAccountId).toBe("google-sub-12345");

    const found = await oauthAccountRepository.findByProviderAccount(db, "GOOGLE", "google-sub-12345");
    expect(found).toBeDefined();
    expect(found?.id).toBe(account.id);

    const userAccounts = await oauthAccountRepository.findByUserId(db, user.id);
    expect(userAccounts).toHaveLength(1);
    expect(userAccounts[0]?.id).toBe(account.id);
  });

  it("enforces uniqueness on (provider, providerAccountId)", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "oauth-dup@example.com",
      fullName: "OAuth Duplicate",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    await oauthAccountRepository.insert(db, {
      id: crypto.randomUUID(),
      userId: user.id,
      provider: "MICROSOFT",
      providerAccountId: "ms-sub-9999",
      createdAt: now,
    });

    // Inserting same provider + providerAccountId should fail unique constraint
    await expect(
      oauthAccountRepository.insert(db, {
        id: crypto.randomUUID(),
        userId: user.id,
        provider: "MICROSOFT",
        providerAccountId: "ms-sub-9999",
        createdAt: now,
      }),
    ).rejects.toThrow();
  });
});
