import { z } from "zod";

export const MemberReportFiltersSchema = z.object({
  sprintId: z.string().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional(),
});

export type MemberReportFilters = z.infer<typeof MemberReportFiltersSchema>;
