import { describe, expect, it } from "vitest";

import {
  ChangePasswordSchema,
  ProfileUpdateSchema,
  SetSystemRoleSchema,
  UserCreateSchema,
  UserFiltersSchema,
  UserIdSchema,
  UserUpdateSchema,
} from "../src";

describe("User management schemas", () => {
  describe("UserCreateSchema", () => {
    it("parses valid user input and normalizes email", () => {
      const result = UserCreateSchema.safeParse({
        fullName: "Jane Doe",
        email: "  Jane.Doe@Example.com  ",
        systemRole: "PM",
        department: "Engineering",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.fullName).toBe("Jane Doe");
      expect(result.data.email).toBe("jane.doe@example.com");
      expect(result.data.systemRole).toBe("PM");
      expect(result.data.department).toBe("Engineering");
    });

    it("rejects invalid email and empty name", () => {
      const result = UserCreateSchema.safeParse({
        fullName: "",
        email: "invalid-email",
        systemRole: "MEMBER",
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.issues.some((i) => i.path.includes("fullName"))).toBe(true);
      expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(true);
    });

    it("rejects invalid system role", () => {
      const result = UserCreateSchema.safeParse({
        fullName: "Test User",
        email: "user@example.com",
        systemRole: "SUPERUSER",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("UserUpdateSchema", () => {
    it("accepts valid partial update with userId", () => {
      const result = UserUpdateSchema.safeParse({
        userId: "u-123",
        fullName: "Jane Updated",
        department: "Operations",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userId).toBe("u-123");
      expect(result.data.fullName).toBe("Jane Updated");
      expect(result.data.department).toBe("Operations");
    });

    it("rejects when userId is missing", () => {
      const result = UserUpdateSchema.safeParse({
        fullName: "Jane Updated",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("UserIdSchema and SetSystemRoleSchema", () => {
    it("validates userId", () => {
      expect(UserIdSchema.safeParse({ userId: "123" }).success).toBe(true);
      expect(UserIdSchema.safeParse({ userId: "" }).success).toBe(false);
    });

    it("validates system role change", () => {
      expect(SetSystemRoleSchema.safeParse({ userId: "123", systemRole: "ADMIN" }).success).toBe(true);
      expect(SetSystemRoleSchema.safeParse({ userId: "123", systemRole: "INVALID" }).success).toBe(false);
    });
  });

  describe("UserFiltersSchema", () => {
    it("parses query params and applies defaults", () => {
      const result = UserFiltersSchema.safeParse({
        page: "2",
        pageSize: "25",
        status: "ACTIVE",
        systemRole: "ADMIN",
        q: "jane",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.status).toBe("ACTIVE");
      expect(result.data.systemRole).toBe("ADMIN");
      expect(result.data.q).toBe("jane");
    });
  });

  describe("ProfileUpdateSchema", () => {
    it("parses valid profile update data", () => {
      const result = ProfileUpdateSchema.safeParse({
        fullName: "New Name",
        phone: "+84987654321",
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.fullName).toBe("New Name");
      expect(result.data.phone).toBe("+84987654321");
    });

    it("normalizes empty phone to null", () => {
      const result = ProfileUpdateSchema.safeParse({
        fullName: "New Name",
        phone: "   ",
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.phone).toBeNull();
    });

    it("rejects empty fullName", () => {
      const result = ProfileUpdateSchema.safeParse({
        fullName: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ChangePasswordSchema", () => {
    it("accepts valid new password matching confirmation", () => {
      const result = ChangePasswordSchema.safeParse({
        currentPassword: "OldPassword123!",
        newPassword: "NewSecurePassword456!",
        confirmPassword: "NewSecurePassword456!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 10 characters", () => {
      const result = ChangePasswordSchema.safeParse({
        newPassword: "short",
        confirmPassword: "short",
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.some((i) => i.path.includes("newPassword"))).toBe(true);
    });

    it("rejects mismatched confirm password", () => {
      const result = ChangePasswordSchema.safeParse({
        newPassword: "NewSecurePassword456!",
        confirmPassword: "DifferentPassword789!",
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    });
  });
});
