import { describe, expect, it } from "vitest";

import { ProjectCreateSchema } from "../src";

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
