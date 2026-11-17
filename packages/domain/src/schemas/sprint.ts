import { z } from "zod";

import { withDateOrder } from "./dateOrder";

export const SprintBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Sprint name must be between 1 and 100 characters")
    .max(100, "Sprint name must be between 1 and 100 characters"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
});

export const SprintCreateSchema = withDateOrder(SprintBaseSchema, "startDate", "endDate");
export type SprintCreateInput = z.infer<typeof SprintCreateSchema>;

export const SprintUpdateSchema = withDateOrder(
  SprintBaseSchema.partial().extend({
    sprintId: z.string().uuid("Invalid sprint ID"),
  }),
  "startDate",
  "endDate",
);
export type SprintUpdateInput = z.infer<typeof SprintUpdateSchema>;

export const SprintArchiveSchema = z.object({
  sprintId: z.string().uuid("Invalid sprint ID"),
});
export type SprintArchiveInput = z.infer<typeof SprintArchiveSchema>;

export function computeSprintStatus(
  sprint: { startDate: string; endDate: string },
  todayStr?: string,
): "PLANNED" | "ACTIVE" | "COMPLETED" {
  const today = todayStr ?? new Date().toISOString().slice(0, 10);
  if (today < sprint.startDate) {
    return "PLANNED";
  }
  if (today > sprint.endDate) {
    return "COMPLETED";
  }
  return "ACTIVE";
}

