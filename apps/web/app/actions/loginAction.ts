import { redirect } from "react-router";

import { LoginSchema } from "@pm/domain";

import { authService } from "../services/auth/auth.service";
import { getSafeRedirect } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";
import { commitSession, getSession } from "../utils/session.server";

export async function loginAction(ctx: RequestContext, request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent !== "login") {
      return Response.json(
        { success: false, errors: { form: ["Invalid action intent"] } },
        { status: 400 },
      );
    }

    const rawData = Object.fromEntries(formData);
    const parsed = LoginSchema.safeParse(rawData);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      return Response.json({ success: false, errors: fieldErrors }, { status: 400 });
    }

    const user = await authService.loginWithPassword(ctx, {
      email: parsed.data.email,
      password: parsed.data.password,
    });

    const session = await getSession(request, ctx.env.SESSION_SECRET);
    session.set("userId", user.id);
    const cookie = await commitSession(session, ctx.env.SESSION_SECRET);

    const defaultHome = user.systemRole === "ADMIN" || user.systemRole === "PM" ? "/admin" : "/";
    const destination = getSafeRedirect(parsed.data.redirectTo, defaultHome);

    return redirect(destination, {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  } catch (error: unknown) {
    return handleActionError(error, ctx);
  }
}
