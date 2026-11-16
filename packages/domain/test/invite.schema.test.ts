import { describe, expect, it } from "vitest";

import { AcceptInviteSchema, EmailInvitePayloadSchema } from "../src";

describe("Invite schemas", () => {
  describe("AcceptInviteSchema", () => {
    it("accepts valid password with matching confirmation", () => {
      const result = AcceptInviteSchema.safeParse({
        password: "ValidPassword123!",
        confirmPassword: "ValidPassword123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 10 characters", () => {
      const result = AcceptInviteSchema.safeParse({
        password: "Short1!",
        confirmPassword: "Short1!",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("at least 10 characters");
      }
    });

    it("rejects mismatched passwords", () => {
      const result = AcceptInviteSchema.safeParse({
        password: "ValidPassword123!",
        confirmPassword: "DifferentPassword123!",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Passwords do not match");
      }
    });
  });

  describe("EmailInvitePayloadSchema", () => {
    it("validates payload with and without sealed token", () => {
      const withToken = EmailInvitePayloadSchema.safeParse({
        inviteId: "inv-123",
        sealedToken: "sealed-cipher-bytes",
      });
      expect(withToken.success).toBe(true);

      const withoutToken = EmailInvitePayloadSchema.safeParse({
        inviteId: "inv-123",
      });
      expect(withoutToken.success).toBe(true);
    });
  });
});
