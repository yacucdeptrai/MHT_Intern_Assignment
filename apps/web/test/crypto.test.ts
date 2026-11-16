import { describe, expect, it } from "vitest";

import { sealInviteToken, unsealInviteToken } from "../app/utils/crypto.server";

describe("crypto.server", () => {
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

  it("seals and unseals invite token accurately", async () => {
    const sealed = await sealInviteToken(token, secret);
    expect(sealed).toContain(":");
    expect(sealed.length).toBeGreaterThan(50);

    const unsealed = await unsealInviteToken(sealed, secret);
    expect(unsealed).toBe(token);
  });

  it("produces non-deterministic ciphertext due to random IV", async () => {
    const sealed1 = await sealInviteToken(token, secret);
    const sealed2 = await sealInviteToken(token, secret);
    expect(sealed1).not.toBe(sealed2);

    expect(await unsealInviteToken(sealed1, secret)).toBe(token);
    expect(await unsealInviteToken(sealed2, secret)).toBe(token);
  });

  it("fails to unseal with incorrect secret", async () => {
    const sealed = await sealInviteToken(token, secret);
    await expect(unsealInviteToken(sealed, "wrong-secret-key-that-does-not-match-at-all")).rejects.toThrow();
  });

  it("fails to unseal tampered ciphertext", async () => {
    const sealed = await sealInviteToken(token, secret);
    const [ivHex, cipherHex] = sealed.split(":");
    expect(ivHex).toBeDefined();
    expect(cipherHex).toBeDefined();
    // Flip last character of cipherHex
    const lastChar = (cipherHex ?? "").slice(-1) === "a" ? "b" : "a";
    const tampered = `${ivHex}:${(cipherHex ?? "").slice(0, -1)}${lastChar}`;

    await expect(unsealInviteToken(tampered, secret)).rejects.toThrow();
  });

  it("rejects invalid format or corrupt IV length", async () => {
    await expect(unsealInviteToken("invalid-format-without-colon", secret)).rejects.toThrow(
      "Invalid sealed token format",
    );
    await expect(unsealInviteToken("short:1234567890", secret)).rejects.toThrow("Invalid sealed token format");
  });
});
