import { useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { loginAction } from "../actions/loginAction";
import { loginLoader } from "../loaders/loginLoader";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return loginLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return loginAction(ctx, request);
}

export default function LoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; errors?: Record<string, string[]>; email?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (actionData && !actionData.success && passwordRef.current) {
      passwordRef.current.value = "";
    }
  }, [actionData]);

  const formError = actionData?.errors?.form?.[0];
  const emailError = actionData?.errors?.email?.[0];
  const passwordError = actionData?.errors?.password?.[0];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-md border border-gray-200">
        <div>
          <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900">
            Project & Task Management
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">Sign in with your email and password</p>
        </div>

        {formError ? (
          <div role="alert" className="rounded-md bg-red-50 p-4 border border-red-200 text-sm font-medium text-red-700">
            {formError}
          </div>
        ) : null}

        <Form method="post" className="mt-8 space-y-6">
          <input type="hidden" name="intent" value="login" />
          {loaderData.redirectTo ? <input type="hidden" name="redirectTo" value={loaderData.redirectTo} /> : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={actionData?.email ?? ""}
                  key={actionData?.email ?? "initial-email"}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  placeholder="name@company.com"
                />
              </div>
              {emailError ? <p className="mt-1 text-sm text-red-600">{emailError}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  ref={passwordRef}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              {passwordError ? <p className="mt-1 text-sm text-red-600">{passwordError}</p> : null}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
