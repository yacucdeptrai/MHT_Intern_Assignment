import { z } from "zod";

import { STATUS_CATEGORIES } from "../enums";

export const StatusBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name must be at most 50 characters"),
  category: z.enum(STATUS_CATEGORIES),
});

export const StatusCreateSchema = StatusBaseSchema;
export type StatusCreateInput = z.input<typeof StatusCreateSchema>;
export type StatusCreateOutput = z.output<typeof StatusCreateSchema>;

export const StatusUpdateSchema = StatusBaseSchema.partial().extend({
  statusId: z.string().min(1, "Status ID is required"),
});
export type StatusUpdateInput = z.input<typeof StatusUpdateSchema>;
export type StatusUpdateOutput = z.output<typeof StatusUpdateSchema>;

export const StatusReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "At least one status ID is required"),
});
export type StatusReorderInput = z.input<typeof StatusReorderSchema>;
export type StatusReorderOutput = z.output<typeof StatusReorderSchema>;

export const StatusIdSchema = z.object({
  statusId: z.string().min(1, "Status ID is required"),
});
export type StatusIdInput = z.input<typeof StatusIdSchema>;
export type StatusIdOutput = z.output<typeof StatusIdSchema>;
