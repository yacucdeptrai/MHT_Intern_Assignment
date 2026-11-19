import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { loginAction } from "../actions/loginAction";
import { LanguageSwitcher } from "../components/i18n/LanguageSwitcher";
import { loginLoader } from "../loaders/loginLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: APP_NAME }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return loginLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return loginAction(ctx, request);
}

export default function LoginPage() {
  const { t } = useTranslation();
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

  const formError = actionData?.errors?.form?.[0] || loaderData.ssoError;
  const emailError = actionData?.errors?.email?.[0];
  const passwordError = actionData?.errors?.password?.[0];

  const hasGoogle = loaderData.ssoProviders.includes("GOOGLE");
  const hasMicrosoft = loaderData.ssoProviders.includes("MICROSOFT");
  const hasSso = hasGoogle || hasMicrosoft;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-md border border-gray-200">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <div>
          <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900">{t("auth.title")}</h1>
          <p className="mt-2 text-center text-sm text-gray-600">{t("auth.subtitle")}</p>
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
                {t("auth.email")}
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
                  placeholder={t("auth.email_placeholder")}
                />
              </div>
              {emailError ? <p className="mt-1 text-sm text-red-600">{emailError}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t("auth.password")}
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
              {isSubmitting ? t("auth.signing_in") : t("auth.sign_in")}
            </button>
          </div>
        </Form>

        {hasSso ? (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">{t("auth.or_continue_with")}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {hasGoogle ? (
                <Form method="post" action="/auth/google">
                  {loaderData.redirectTo ? (
                    <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
                  ) : null}
                  <button
                    type="submit"
                    data-testid="sso-google"
                    className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{t("auth.continue_with_google")}</span>
                  </button>
                </Form>
              ) : null}

              {hasMicrosoft ? (
                <Form method="post" action="/auth/microsoft">
                  {loaderData.redirectTo ? (
                    <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
                  ) : null}
                  <button
                    type="submit"
                    data-testid="sso-microsoft"
                    className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 23 23">
                      <path fill="#f35325" d="M1 1h10v10H1z" />
                      <path fill="#81bc06" d="M12 1h10v10H12z" />
                      <path fill="#05a6f0" d="M1 12h10v10H1z" />
                      <path fill="#ffba08" d="M12 12h10v10H12z" />
                    </svg>
                    <span>{t("auth.continue_with_microsoft")}</span>
                  </button>
                </Form>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
