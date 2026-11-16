import type { ProfileDto } from "@pm/domain";
import { ChangePasswordSchema, ProfileUpdateSchema, ValidationError } from "@pm/domain";

import { profileService } from "../services/user/profile.service";
import { requireUser } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

export interface ProfileActionData {
  success: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
  user?: ProfileDto;
}

export async function profileAction(ctx: RequestContext, request: Request): Promise<Response> {
  const user = await requireUser(ctx, request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateProfile") {
    const fullNameRaw = formData.get("fullName");
    const phoneRaw = formData.get("phone");
    const raw = {
      fullName: typeof fullNameRaw === "string" ? fullNameRaw : undefined,
      phone: typeof phoneRaw === "string" ? phoneRaw : undefined,
    };

    const parsed = ProfileUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0]?.toString() ?? "form";
        errors[path] = errors[path] ?? [];
        errors[path].push(issue.message);
      }
      return Response.json(
        {
          success: false,
          errors,
          values: {
            fullName: typeof fullNameRaw === "string" ? fullNameRaw : "",
            phone: typeof phoneRaw === "string" ? phoneRaw : "",
          },
        },
        { status: 400 },
      );
    }

    try {
      const updated = await profileService.updateProfile(ctx, user.id, parsed.data);
      return Response.json({ success: true, user: updated }, { status: 200 });
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        return Response.json({ success: false, errors: err.fieldErrors ?? { form: [err.message] } }, { status: 400 });
      }
      throw err;
    }
  }

  if (intent === "changePassword") {
    const currentPasswordRaw = formData.get("currentPassword");
    const newPasswordRaw = formData.get("newPassword");
    const confirmPasswordRaw = formData.get("confirmPassword");

    const raw = {
      currentPassword:
        typeof currentPasswordRaw === "string" && currentPasswordRaw.length > 0 ? currentPasswordRaw : undefined,
      newPassword: typeof newPasswordRaw === "string" ? newPasswordRaw : "",
      confirmPassword: typeof confirmPasswordRaw === "string" ? confirmPasswordRaw : "",
    };

    const parsed = ChangePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0]?.toString() ?? "form";
        errors[path] = errors[path] ?? [];
        errors[path].push(issue.message);
      }
      return Response.json({ success: false, errors }, { status: 400 });
    }

    try {
      await profileService.changePassword(ctx, user.id, parsed.data);
      return Response.json({ success: true, message: "Password updated successfully" }, { status: 200 });
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        return Response.json({ success: false, errors: err.fieldErrors ?? { form: [err.message] } }, { status: 400 });
      }
      throw err;
    }
  }

  return Response.json({ success: false, errors: { form: ["Invalid action"] } }, { status: 400 });
}
