import { z } from "zod";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../enums";
import { withDateOrder } from "./dateOrder";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!dateRegex.test(value)) {
    return false;
  }
  const parts = value.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const optionalCalendarDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((val) => (val ? val : undefined))
  .refine((val) => val === undefined || isValidCalendarDate(val), {
    message: "Date must be a valid calendar date in YYYY-MM-DD format",
  });

export const AuditFiltersBaseSchema = z.object({
  actorId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val ? val : undefined)),
  entityType: z
    .enum(AUDIT_ENTITY_TYPES)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val ? val : undefined)),
  action: z
    .enum(AUDIT_ACTIONS)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val ? val : undefined)),
  from: optionalCalendarDate,
  to: optionalCalendarDate,
  page: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().min(1).default(1),
  ),
  pageSize: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().int().min(1).max(100).default(50),
  ),
});

export const AuditFiltersSchema = withDateOrder(AuditFiltersBaseSchema, "from", "to");
export type AuditFiltersInput = z.input<typeof AuditFiltersSchema>;
export type AuditFiltersOutput = z.output<typeof AuditFiltersSchema>;
