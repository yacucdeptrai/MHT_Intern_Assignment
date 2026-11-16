import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email format")),
  password: z.string().min(1, "Password is required"),
  redirectTo: z.string().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
