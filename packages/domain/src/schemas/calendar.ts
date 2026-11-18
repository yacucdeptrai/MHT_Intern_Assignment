import { z } from "zod";

export const CalendarQuerySchema = z.object({
  view: z.enum(["day", "week", "month"]).default("month"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional(),
  projectId: z.string().optional(),
});

export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
