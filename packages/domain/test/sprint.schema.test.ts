import { describe, expect, it } from "vitest";

import {
  computeSprintStatus,
  SprintArchiveSchema,
  SprintCreateSchema,
  SprintUpdateSchema,
} from "../src/schemas/sprint";

describe("SprintCreateSchema (FR-36 c1)", () => {
  it("FR-36 c1: accepts valid sprint creation input", () => {
    const parsed = SprintCreateSchema.safeParse({
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-15",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Sprint 1");
      expect(parsed.data.startDate).toBe("2026-11-01");
      expect(parsed.data.endDate).toBe("2026-11-15");
    }
  });

  it("FR-36 c1: rejects endDate before startDate", () => {
    const parsed = SprintCreateSchema.safeParse({
      name: "Invalid Dates Sprint",
      startDate: "2026-11-20",
      endDate: "2026-11-10",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("End date must be on or after start date");
    }
  });

  it("FR-36 c1: rejects empty name or name exceeding 100 characters", () => {
    expect(
      SprintCreateSchema.safeParse({
        name: "   ",
        startDate: "2026-11-01",
        endDate: "2026-11-15",
      }).success,
    ).toBe(false);

    expect(
      SprintCreateSchema.safeParse({
        name: "A".repeat(101),
        startDate: "2026-11-01",
        endDate: "2026-11-15",
      }).success,
    ).toBe(false);
  });

  it("FR-36 c1: rejects invalid date formats", () => {
    expect(
      SprintCreateSchema.safeParse({
        name: "Bad Date Format",
        startDate: "01/11/2026",
        endDate: "2026-11-15",
      }).success,
    ).toBe(false);
  });
});

describe("SprintUpdateSchema (FR-36)", () => {
  const sprintId = "11111111-1111-4111-8111-111111111111";

  it("accepts valid partial update with sprintId", () => {
    const parsed = SprintUpdateSchema.safeParse({
      sprintId,
      name: "Renamed Sprint",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid sprintId or date ordering violation in update", () => {
    expect(
      SprintUpdateSchema.safeParse({
        sprintId: "",
        name: "Test",
      }).success,
    ).toBe(false);

    expect(
      SprintUpdateSchema.safeParse({
        sprintId,
        startDate: "2026-11-20",
        endDate: "2026-11-10",
      }).success,
    ).toBe(false);
  });
});

describe("SprintArchiveSchema (FR-36 c4)", () => {
  it("accepts valid sprintId", () => {
    expect(
      SprintArchiveSchema.safeParse({
        sprintId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("rejects empty sprintId", () => {
    expect(SprintArchiveSchema.safeParse({ sprintId: "" }).success).toBe(false);
  });
});

describe("computeSprintStatus", () => {
  it("computes PLANNED when today is before startDate", () => {
    expect(computeSprintStatus({ startDate: "2026-12-01", endDate: "2026-12-15" }, "2026-11-17")).toBe("PLANNED");
  });

  it("computes ACTIVE when today is between startDate and endDate", () => {
    expect(computeSprintStatus({ startDate: "2026-11-10", endDate: "2026-11-25" }, "2026-11-17")).toBe("ACTIVE");
  });

  it("computes COMPLETED when today is after endDate", () => {
    expect(computeSprintStatus({ startDate: "2026-11-01", endDate: "2026-11-15" }, "2026-11-17")).toBe("COMPLETED");
  });
});
