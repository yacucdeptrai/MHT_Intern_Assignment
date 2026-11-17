import { z } from "zod";
import { TASK_PRIORITIES } from "../enums";

export const TaskCreateBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title must be at least 1 character")
    .max(200, "Title must not exceed 200 characters"),
  description: z
    .string()
    .max(10000, "Description must not exceed 10,000 characters")
    .optional()
    .nullable()
    .transform((val) => (val === "" ? null : (val ?? null))),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? null : val)),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be in YYYY-MM-DD format")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? null : val)),
  sprintId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? null : val)),
  parentTaskId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? null : val)),
  assigneeIds: z
    .union([
      z.array(z.string()),
      z.string().transform((s) =>
        s.trim()
          ? s
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      ),
    ])
    .optional()
    .default([]),
});

export const TaskCreateSchema = TaskCreateBaseSchema.superRefine((data, ctx) => {
  if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
    ctx.addIssue({
      code: "custom",
      message: "Due date must be on or after start date",
      path: ["dueDate"],
    });
  }
});

export const TaskIdSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
});

export const ProjectTaskFiltersSchema = z.object({
  statusId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  assigneeId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  priority: z
    .enum(TASK_PRIORITIES)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  sprintId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const MyTaskFiltersSchema = z.object({
  projectId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  statusId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  priority: z
    .enum(TASK_PRIORITIES)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? undefined : val)),
  dueRange: z
    .enum(["all", "overdue", "today", "week"])
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? ("all" as const) : val))
    .default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = TaskCreateBaseSchema.omit({
  parentTaskId: true,
  assigneeIds: true,
})
  .partial()
  .extend({
    version: z.coerce.number().int().positive("Version must be a positive integer"),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "Due date must be on or after start date",
        path: ["dueDate"],
      });
    }
  });

export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

export const TaskAssignSchema = z.object({
  version: z.coerce.number().int().positive("Version must be a positive integer"),
  assigneeIds: z
    .union([
      z.array(z.string()),
      z.string().transform((s) =>
        s.trim()
          ? s
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      ),
    ])
    .optional()
    .default([]),
});

export type TaskAssignInput = z.infer<typeof TaskAssignSchema>;

export const TaskArchiveSchema = z.object({
  version: z.coerce.number().int().positive("Version must be a positive integer"),
});

export type TaskArchiveInput = z.infer<typeof TaskArchiveSchema>;
