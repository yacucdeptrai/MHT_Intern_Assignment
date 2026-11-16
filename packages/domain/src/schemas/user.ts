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
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const UserCreateSchema = UserBaseSchema;
export type UserCreateInput = z.input<typeof UserCreateSchema>;
export type UserCreateOutput = z.output<typeof UserCreateSchema>;

export const UserUpdateSchema = UserBaseSchema.partial().extend({
  userId: z.string().min(1, "User ID is required"),
});
export type UserUpdateInput = z.input<typeof UserUpdateSchema>;
export type UserUpdateOutput = z.output<typeof UserUpdateSchema>;

export const UserIdSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});
export type UserIdInput = z.input<typeof UserIdSchema>;

export const SetSystemRoleSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  systemRole: z.enum(SYSTEM_ROLES),
});
export type SetSystemRoleInput = z.input<typeof SetSystemRoleSchema>;

export const UserFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(USER_STATUSES).optional(),
  systemRole: z.enum(SYSTEM_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type UserFiltersInput = z.input<typeof UserFiltersSchema>;
export type UserFilters = z.output<typeof UserFiltersSchema>;
