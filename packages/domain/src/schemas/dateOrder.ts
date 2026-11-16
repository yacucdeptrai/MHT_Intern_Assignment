import type { z } from "zod";

export function withDateOrder<T extends z.ZodType>(schema: T, startKey: string, endKey: string) {
  return schema.superRefine((data, ctx) => {
    if (!data || typeof data !== "object") {
      return;
    }
    const record = data as Record<string, unknown>;
    const startVal = record[startKey];
    const endVal = record[endKey];

    if (typeof startVal === "string" && typeof endVal === "string" && startVal.length > 0 && endVal.length > 0) {
      if (endVal < startVal) {
        ctx.addIssue({
          code: "custom",
          message: "End date must be on or after start date",
          path: [endKey],
        });
      }
    }
  });
}
