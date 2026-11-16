import { SetSystemRoleSchema, UserCreateSchema, UserIdSchema, UserUpdateSchema, ValidationError } from "@pm/domain";

import { userService } from "../services/user/user.service";
import { requireSystemRole, requireUser } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";

export async function adminUsersAction(ctx: RequestContext, request: Request): Promise<Response> {
  let rawData: Record<string, unknown> = {};
  try {
    const user = await requireUser(ctx, request);
    requireSystemRole(user, ["ADMIN"]);

    const formData = await request.formData();
    rawData = Object.fromEntries(formData);
    const intent = rawData.intent;

    if (intent === "create") {
      const parsed = UserCreateSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json({ success: false, errors: fieldErrors, values: rawData }, { status: 400 });
      }

      const result = await userService.createUser(ctx, parsed.data);
      return Response.json({ success: true, ...result });
    }

    if (intent === "update") {
      const parsed = UserUpdateSchema.safeParse(rawData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string") {
            fieldErrors[field] = fieldErrors[field] ?? [];
            fieldErrors[field].push(issue.message);
          }
        }
        return Response.json({ success: false, errors: fieldErrors, values: rawData }, { status: 400 });
      }

      const updated = await userService.updateUser(ctx, parsed.data);
      return Response.json({ success: true, user: updated });
    }

    if (intent === "lock") {
      const parsed = UserIdSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { userId: ["Invalid user ID"] } }, { status: 400 });
      }
      await userService.lockUser(ctx, parsed.data.userId);
      return Response.json({ success: true });
    }

    if (intent === "unlock") {
      const parsed = UserIdSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { userId: ["Invalid user ID"] } }, { status: 400 });
      }
      await userService.unlockUser(ctx, parsed.data.userId);
      return Response.json({ success: true });
    }

    if (intent === "delete") {
      const parsed = UserIdSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { userId: ["Invalid user ID"] } }, { status: 400 });
      }
      await userService.deleteUser(ctx, parsed.data.userId);
      return Response.json({ success: true });
    }

    if (intent === "setRole") {
      const parsed = SetSystemRoleSchema.safeParse(rawData);
      if (!parsed.success) {
        return Response.json({ success: false, errors: { form: ["Invalid role update"] } }, { status: 400 });
      }
      await userService.setSystemRole(ctx, parsed.data.userId, parsed.data.systemRole);
      return Response.json({ success: true });
    }

    return Response.json({ success: false, errors: { form: ["Invalid action intent"] } }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return Response.json(
        {
          success: false,
          errors: error.fieldErrors ?? { form: [error.message] },
          message: error.message,
          values: rawData,
        },
        { status: 400 },
      );
    }
    return handleActionError(error, ctx);
  }
}
