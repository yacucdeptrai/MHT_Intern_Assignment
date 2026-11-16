import { PBKDF2_DEFAULT_ITERATIONS, PBKDF2_MAX_ITERATIONS, PBKDF2_MIN_ITERATIONS } from "@pm/domain";
import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "../app/services/auth/password.server";

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("stores the iteration count next to a salt.hash string", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(stored.iterations).toBe(PBKDF2_DEFAULT_ITERATIONS);
    expect(stored.hash).toMatch(/^[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/);
    expect(stored.hash).not.toContain(PASSWORD);
  });

  it("uses a fresh random salt for every hash", async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(first.hash).not.toBe(second.hash);
  });

  it("supports the Workers maximum of 100,000 iterations", async () => {
    await expect(hashPassword(PASSWORD, PBKDF2_MAX_ITERATIONS)).resolves.toMatchObject({ iterations: 100_000 });
  });

  it("rejects iteration counts outside the allowed range", async () => {
    await expect(hashPassword(PASSWORD, PBKDF2_MAX_ITERATIONS + 1)).rejects.toThrow(RangeError);
    await expect(hashPassword(PASSWORD, PBKDF2_MIN_ITERATIONS - 1)).rejects.toThrow(RangeError);
  });
});

describe("verifyPassword", () => {
  it("accepts the original password", async () => {
    const stored = await hashPassword(PASSWORD, PBKDF2_MIN_ITERATIONS);
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("rejects a different password", async () => {
    const stored = await hashPassword(PASSWORD, PBKDF2_MIN_ITERATIONS);
    await expect(verifyPassword("correct horse battery stapler", stored)).resolves.toBe(false);
  });

  it("uses the stored iteration count, not the current default", async () => {
    const stored = await hashPassword(PASSWORD, PBKDF2_MIN_ITERATIONS);
    await expect(verifyPassword(PASSWORD, { ...stored, iterations: PBKDF2_MIN_ITERATIONS + 1 })).resolves.toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    await expect(
      verifyPassword(PASSWORD, { hash: "not-a-valid-hash", iterations: PBKDF2_MIN_ITERATIONS }),
    ).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, { hash: "AAAA.AAAA", iterations: PBKDF2_MAX_ITERATIONS + 1 })).resolves.toBe(
      false,
    );
  });
});

describe("needsRehash", () => {
  it("flags hashes made with fewer iterations than the current default", () => {
    expect(needsRehash({ hash: "x.y", iterations: PBKDF2_MIN_ITERATIONS })).toBe(true);
    expect(needsRehash({ hash: "x.y", iterations: PBKDF2_DEFAULT_ITERATIONS })).toBe(false);
  });
});
