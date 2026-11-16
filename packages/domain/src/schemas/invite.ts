import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../constants";
import { PROJECT_ROLES } from "../enums";

export const AcceptInviteSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AcceptInviteInput = z.input<typeof AcceptInviteSchema>;
export type AcceptInviteOutput = z.output<typeof AcceptInviteSchema>;

export const EmailInvitePayloadSchema = z.object({
  inviteId: z.string().min(1),
  sealedToken: z.string().optional(),
});
export type EmailInvitePayload = z.infer<typeof EmailInvitePayloadSchema>;

export const CreateInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email format")),
  projectId: z.string().nullable().optional(),
  projectRole: z.enum(PROJECT_ROLES).nullable().optional(),
});
export type CreateInviteInput = z.input<typeof CreateInviteSchema>;
