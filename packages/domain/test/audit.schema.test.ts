import { describe, expect, it } from "vitest";

import { AuditFiltersSchema } from "../src";

describe("AuditFiltersSchema (FR-24 c2)", () => {
  it("FR-24 c2: defaults page to 1, pageSize to 50, and normalizes empty strings to undefined", () => {
    const parsed = AuditFiltersSchema.parse({
      actorId: "",
      entityType: "",
      action: "",
      from: "",
      to: "",
      page: "",
      pageSize: "",
    });

    expect(parsed).toEqual({
      actorId: undefined,
      entityType: undefined,
      action: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 50,
    });
  });

  it("FR-24 c2: parses valid actorId, entityType, action, date range, and pagination", () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    const parsed = AuditFiltersSchema.parse({
      actorId,
      entityType: "TASK",
      action: "TASK_REJECTED",
      from: "2026-11-01",
      to: "2026-11-18",
      page: "2",
      pageSize: "25",
    });

    expect(parsed).toEqual({
      actorId,
      entityType: "TASK",
      action: "TASK_REJECTED",
      from: "2026-11-01",
      to: "2026-11-18",
      page: 2,
      pageSize: 25,
    });
  });

  it("FR-24 c2: rejects invalid entityType, invalid action, malformed dates, or inverted date range", () => {
    expect(AuditFiltersSchema.safeParse({ entityType: "COMMENT" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ action: "UNKNOWN_ACTION" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ from: "18-11-2026" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ from: "2026-11-20", to: "2026-11-10" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(AuditFiltersSchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
