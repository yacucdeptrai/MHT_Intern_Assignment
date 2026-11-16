import { describe, expect, it } from "vitest";

import { LoginSchema } from "../src";

describe("LoginSchema", () => {
  it("parses valid login credentials and normalizes email", () => {
    const result = LoginSchema.safeParse({
      email: "  User@Example.COM  ",
      password: "SecretPassword123!",
      redirectTo: "/admin",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.email).toBe("user@example.com");
    expect(result.data.password).toBe("SecretPassword123!");
    expect(result.data.redirectTo).toBe("/admin");
  });

  it("allows omitting redirectTo", () => {
    const result = LoginSchema.safeParse({
      email: "member@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.redirectTo).toBeUndefined();
  });

  it("rejects invalid emails", () => {
    const result = LoginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.includes("email"))).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email: "valid@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.some((issue) => issue.path.includes("password"))).toBe(true);
  });
});
