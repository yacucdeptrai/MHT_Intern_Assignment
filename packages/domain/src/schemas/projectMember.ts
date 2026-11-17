import { z } from "zod";

import { PROJECT_ROLES } from "../enums";

export const UserSearchSchema = z.object({
  q: z.string().trim().default(""),
});

export const MemberAddSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectRole: z.enum(PROJECT_ROLES),
});

export const MemberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email format")),
  projectRole: z.enum(PROJECT_ROLES),
});

export const MemberIdSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const MemberRoleSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectRole: z.enum(PROJECT_ROLES),
});

export type UserSearchInput = z.infer<typeof UserSearchSchema>;
export type MemberAddInput = z.infer<typeof MemberAddSchema>;
export type MemberInviteInput = z.infer<typeof MemberInviteSchema>;
export type MemberIdInput = z.infer<typeof MemberIdSchema>;
export type MemberRoleInput = z.infer<typeof MemberRoleSchema>;
