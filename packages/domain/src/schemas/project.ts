import { z } from "zod";

import { PROJECT_STATUSES } from "../enums";
import { withDateOrder } from "./dateOrder";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const codeRegex = /^[A-Za-z0-9-]{2,10}$/;

export const ProjectBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Project code must be at least 2 characters")
    .max(10, "Project code must be at most 10 characters")
    .regex(codeRegex, "Project code must only contain letters, numbers, and hyphens")
    .transform((val) => val.toUpperCase()),
  name: z.string().trim().min(1, "Project name is required").max(150, "Project name must be at most 150 characters"),
  description: z
    .string()
    .trim()
    .max(10000, "Description must be at most 10,000 characters")
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
  budget: z
    .preprocess((val) => {
      if (val === "" || val === null || val === undefined) return null;
      if (typeof val === "string") {
        const num = Number(val);
        return isNaN(num) ? val : num;
      }
      return val;
    }, z.number().int("Budget must be an integer").min(0, "Budget cannot be negative").nullable())
    .default(null),
  startDate: z.string().trim().regex(dateRegex, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().trim().regex(dateRegex, "End date must be in YYYY-MM-DD format"),
  slackChannelId: z
    .string()
    .trim()
    .max(50, "Slack channel ID must be at most 50 characters")
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const ProjectCreateSchema = withDateOrder(ProjectBaseSchema, "startDate", "endDate");
export type ProjectCreateInput = z.input<typeof ProjectCreateSchema>;
export type ProjectCreateOutput = z.output<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = withDateOrder(
  z.object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required")
      .max(150, "Project name must be at most 150 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(10000, "Description must be at most 10,000 characters")
      .nullish()
      .transform((val) => (val && val.length > 0 ? val : null))
      .optional(),
    budget: z
      .preprocess((val) => {
        if (val === "" || val === null || val === undefined) return null;
        if (typeof val === "string") {
          const num = Number(val);
          return isNaN(num) ? val : num;
        }
        return val;
      }, z.number().int("Budget must be an integer").min(0, "Budget cannot be negative").nullable())
      .optional(),
    startDate: z.string().trim().regex(dateRegex, "Start date must be in YYYY-MM-DD format").optional(),
    endDate: z.string().trim().regex(dateRegex, "End date must be in YYYY-MM-DD format").optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    slackChannelId: z
      .string()
      .trim()
      .max(50, "Slack channel ID must be at most 50 characters")
      .nullish()
      .transform((val) => (val && val.length > 0 ? val : null))
      .optional(),
  }),
  "startDate",
  "endDate",
);
export type ProjectUpdateInput = z.input<typeof ProjectUpdateSchema>;
export type ProjectUpdateOutput = z.output<typeof ProjectUpdateSchema>;
