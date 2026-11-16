import { useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { AcceptInviteSchema, APP_NAME } from "@pm/domain";

import { inviteService } from "../services/invite.service";
import { handleActionError } from "../utils/errors.server";
import { requestContextKey } from "../utils/requestContext.server";
import { commitSession, getSession, isRequestSecure } from "../utils/session.server";

export function meta() {
  return [{ title: `Accept Invitation | ${APP_NAME}` }];
}

export async function loader({ context, params }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const token = params.token ?? "";
  const validation = await inviteService.validateToken(ctx, token);

  return {
    status: validation.status,
    email: validation.email,
    projectName: validation.projectName,
  };
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const token = params.token ?? "";

  try {
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData.entries());
    const parsed = AcceptInviteSchema.safeParse(rawData);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        fieldErrors[field] = fieldErrors[field] ?? [];
        fieldErrors[field].push(issue.message);
      }
      return Response.json(
        {
          success: false,
          errors: fieldErrors,
        },
        { status: 400 },
      );
    }

    const sessionUser = await inviteService.acceptInvite(ctx, token, parsed.data.password);

    // Create session and sign in
    const session = await getSession(request, ctx.env.SESSION_SECRET);
    session.set("userId", sessionUser.id);
    const isSecure = isRequestSecure(request) || ctx.env.APP_ENV === "production" || ctx.env.APP_ENV === "staging";
    const cookie = await commitSession(session, {
      secret: ctx.env.SESSION_SECRET,
      secure: isSecure,
    });

    const homeUrl = sessionUser.systemRole === "ADMIN" || sessionUser.systemRole === "PM" ? "/admin" : "/";

    return redirect(homeUrl, {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  } catch (err: unknown) {
    return handleActionError(err, ctx);
  }
}

export default function InvitePage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; errors?: Record<string, string[]>; message?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (actionData && !actionData.success && passwordRef.current) {
      passwordRef.current.value = "";
    }
  }, [actionData]);

  if (loaderData.status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm border border-gray-200 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <span className="text-xl text-red-600 font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">This invite is invalid or has expired</h1>
          <p className="text-sm text-gray-600">
            The link you followed has expired, already been used, or does not exist. Please contact your organization
            administrator for a new invite.
          </p>
        </div>
      </div>
    );
  }

  const passwordError = actionData?.errors?.password?.[0];
  const confirmPasswordError = actionData?.errors?.confirmPassword?.[0];
  const formError = actionData?.message ?? actionData?.errors?.form?.[0];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-sm border border-gray-200">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">{APP_NAME}</span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Accept Invitation</h1>
          <p className="text-sm text-gray-600">
            Set a password for <span className="font-semibold text-gray-900">{loaderData.email}</span>
            {loaderData.projectName ? ` to join ${loaderData.projectName}` : ""}.
          </p>
        </div>

        {formError ? (
          <div role="alert" className="rounded-md bg-red-50 p-4 border border-red-200 text-sm font-medium text-red-700">
            {formError}
          </div>
        ) : null}

        <Form method="post" className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="At least 10 characters"
            />
            {passwordError ? <p className="mt-1 text-xs text-red-600">{passwordError}</p> : null}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Re-enter password"
            />
            {confirmPasswordError ? <p className="mt-1 text-xs text-red-600">{confirmPasswordError}</p> : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? "Setting password..." : "Set Password and Sign In"}
          </button>
        </Form>
      </div>
    </div>
  );
}
