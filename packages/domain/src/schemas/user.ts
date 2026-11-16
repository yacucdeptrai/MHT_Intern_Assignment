import { z } from "zod";

import { SYSTEM_ROLES, USER_STATUSES } from "../enums";

export const UserBaseSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Full name must be at most 100 characters"),
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email format")),
  systemRole: z.enum(SYSTEM_ROLES),
  department: z
    .string()
    .trim()
    .max(100, "Department must be at most 100 characters")
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const UserCreateSchema = UserBaseSchema;
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = UserBaseSchema.partial().extend({
  userId: z.string().min(1, "User ID is required"),
});
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export const UserIdSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});
export type UserIdInput = z.infer<typeof UserIdSchema>;

export const SetSystemRoleSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  systemRole: z.enum(SYSTEM_ROLES),
});
export type SetSystemRoleInput = z.infer<typeof SetSystemRoleSchema>;

export const UserFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(USER_STATUSES).optional(),
  systemRole: z.enum(SYSTEM_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type UserFilters = z.infer<typeof UserFiltersSchema>;
