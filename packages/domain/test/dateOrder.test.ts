import { describe, expect, it } from "vitest";
import { z } from "zod";

import { withDateOrder } from "../src";

describe("withDateOrder schema refinement", () => {
  const Schema = withDateOrder(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
    "startDate",
    "endDate",
  );

  it("passes when endDate is after startDate", () => {
    const result = Schema.safeParse({
      startDate: "2026-11-01",
      endDate: "2026-11-10",
    });
    expect(result.success).toBe(true);
  });

  it("passes when endDate is equal to startDate", () => {
    const result = Schema.safeParse({
      startDate: "2026-11-01",
      endDate: "2026-11-01",
    });
    expect(result.success).toBe(true);
  });

  it("FR-07 c3: fails with field error when endDate is before startDate", () => {
    const result = Schema.safeParse({
      startDate: "2026-11-10",
      endDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path[0] === "endDate" && i.message === "End date must be on or after start date",
        ),
      ).toBe(true);
    }
  });

  it("skips comparison when either date is missing", () => {
    const OptionalSchema = withDateOrder(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      "startDate",
      "endDate",
    );

    const result1 = OptionalSchema.safeParse({ startDate: "2026-11-10" });
    expect(result1.success).toBe(true);

    const result2 = OptionalSchema.safeParse({ endDate: "2026-11-10" });
    expect(result2.success).toBe(true);
  });
});
