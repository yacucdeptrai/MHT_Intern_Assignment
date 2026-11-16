import { redirect } from "react-router";

import { LoginSchema, ValidationError } from "@pm/domain";

import { authService } from "../services/auth/auth.service";
import { getSafeRedirect } from "../utils/auth.server";
import { handleActionError } from "../utils/errors.server";
import type { RequestContext } from "../utils/requestContext.server";
import { commitSession, getSession, isRequestSecure } from "../utils/session.server";

export async function loginAction(ctx: RequestContext, request: Request): Promise<Response> {
  let rawEmail = "";
  try {
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent !== "login") {
      return Response.json({ success: false, errors: { form: ["Invalid action intent"] } }, { status: 400 });
    }

    const rawData = Object.fromEntries(formData);
    rawEmail = typeof rawData.email === "string" ? rawData.email : "";
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
      return Response.json({ success: false, errors: fieldErrors, email: rawEmail }, { status: 400 });
    }

    const user = await authService.loginWithPassword(ctx, {
      email: parsed.data.email,
      password: parsed.data.password,
    });

    const session = await getSession(request, ctx.env.SESSION_SECRET);
    session.set("userId", user.id);

    const isSecure = isRequestSecure(request) || ctx.env.APP_ENV === "production" || ctx.env.APP_ENV === "staging";
    const cookie = await commitSession(session, { secret: ctx.env.SESSION_SECRET, secure: isSecure });

    const defaultHome = user.systemRole === "ADMIN" || user.systemRole === "PM" ? "/admin" : "/";
    const destination = getSafeRedirect(parsed.data.redirectTo, defaultHome);

    return redirect(destination, {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return Response.json(
        {
          success: false,
          errors: error.fieldErrors ?? { form: [error.message] },
          message: error.message,
          email: rawEmail,
        },
        { status: 400 },
      );
    }
    return handleActionError(error, ctx);
  }
}
