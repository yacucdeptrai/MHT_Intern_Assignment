import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../constants";
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

export const ProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Full name must be at most 100 characters"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number must be at most 30 characters")
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
});
export type ProfileUpdateInput = z.input<typeof ProfileUpdateSchema>;
export type ProfileUpdateOutput = z.output<typeof ProfileUpdateSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.input<typeof ChangePasswordSchema>;
export type ChangePasswordOutput = z.output<typeof ChangePasswordSchema>;
