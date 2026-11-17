import { describe, expect, it } from "vitest";

import { ProjectCreateSchema, ProjectUpdateSchema } from "../src";

describe("ProjectCreateSchema", () => {
  const validPayload = {
    code: "prj-101",
    name: "Platform Migration",
    description: "Migrating to Cloudflare",
    budget: 50000000,
    startDate: "2026-11-01",
    endDate: "2026-12-31",
    slackChannelId: "C12345678",
  };

  it("FR-07 c1: parses valid project payload and normalizes code to uppercase", () => {
    const result = ProjectCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("PRJ-101");
      expect(result.data.name).toBe("Platform Migration");
      expect(result.data.budget).toBe(50000000);
      expect(result.data.startDate).toBe("2026-11-01");
      expect(result.data.endDate).toBe("2026-12-31");
    }
  });

  it("accepts minimal payload without optional fields", () => {
    const result = ProjectCreateSchema.safeParse({
      code: "AB",
      name: "Minimal",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
      expect(result.data.budget).toBeNull();
      expect(result.data.slackChannelId).toBeNull();
    }
  });

  it("rejects code with fewer than 2 or more than 10 characters", () => {
    const tooShort = ProjectCreateSchema.safeParse({
      ...validPayload,
      code: "A",
    });
    expect(tooShort.success).toBe(false);

    const tooLong = ProjectCreateSchema.safeParse({
      ...validPayload,
      code: "ABCDEFGHIJK",
    });
    expect(tooLong.success).toBe(false);
  });

  it("rejects code with invalid characters (only letters, digits, hyphens allowed)", () => {
    const invalidChar = ProjectCreateSchema.safeParse({
      ...validPayload,
      code: "PRJ_101",
    });
    expect(invalidChar.success).toBe(false);
  });

  it("rejects negative budget or non-integer budget", () => {
    const negative = ProjectCreateSchema.safeParse({
      ...validPayload,
      budget: -100,
    });
    expect(negative.success).toBe(false);

    const decimal = ProjectCreateSchema.safeParse({
      ...validPayload,
      budget: 100.5,
    });
    expect(decimal.success).toBe(false);
  });

  it("FR-07 c3: rejects when endDate is before startDate", () => {
    const inverted = ProjectCreateSchema.safeParse({
      ...validPayload,
      startDate: "2026-12-31",
      endDate: "2026-11-01",
    });
    expect(inverted.success).toBe(false);
    if (!inverted.success) {
      expect(inverted.error.issues.some((i) => i.path[0] === "endDate")).toBe(true);
    }
  });

  it("validates date format as YYYY-MM-DD", () => {
    const badDate = ProjectCreateSchema.safeParse({
      ...validPayload,
      startDate: "invalid-date",
    });
    expect(badDate.success).toBe(false);
  });
});

describe("ProjectUpdateSchema (FR-08)", () => {
  it("FR-08 c1: parses valid partial updates", () => {
    const result = ProjectUpdateSchema.safeParse({
      name: "Updated Project Name",
      description: "Updated description",
      status: "ON_HOLD",
      budget: 80000000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Updated Project Name");
      expect(result.data.description).toBe("Updated description");
      expect(result.data.status).toBe("ON_HOLD");
      expect(result.data.budget).toBe(80000000);
    }
  });

  it("FR-08 c2: omits / ignores code if supplied in input", () => {
    const result = ProjectUpdateSchema.safeParse({
      name: "New Name",
      code: "ATTEMPTED_CODE_CHANGE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("code");
    }
  });

  it("validates status enum strictly", () => {
    const validActive = ProjectUpdateSchema.safeParse({ status: "ACTIVE" });
    const validCompleted = ProjectUpdateSchema.safeParse({ status: "COMPLETED" });
    const invalid = ProjectUpdateSchema.safeParse({ status: "DELETED" });

    expect(validActive.success).toBe(true);
    expect(validCompleted.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("rejects when updated endDate is before updated startDate", () => {
    const result = ProjectUpdateSchema.safeParse({
      startDate: "2026-12-31",
      endDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts single date update without failing date order check", () => {
    const result = ProjectUpdateSchema.safeParse({
      startDate: "2026-11-15",
    });
    expect(result.success).toBe(true);
  });
});
