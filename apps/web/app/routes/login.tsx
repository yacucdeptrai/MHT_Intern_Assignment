import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { loginAction } from "../actions/loginAction";
import { AuthFrame, AuthHeading } from "../components/layouts/AuthFrame";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
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

  const redirectInput = loaderData.redirectTo ? (
    <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
  ) : null;

  return (
    <AuthFrame>
      <AuthHeading title={t("auth.sign_in")} description={t("auth.subtitle")} />

      {formError ? (
        <Banner tone="danger" role="alert">
          {formError}
        </Banner>
      ) : null}

      <Form method="post" className="flex flex-col gap-3.5">
        <input type="hidden" name="intent" value="login" />
        {redirectInput}
        <Input
          id="email"
          name="email"
          type="email"
          size="lg"
          autoComplete="email"
          required
          requiredMark={false}
          label={t("auth.email")}
          placeholder={t("auth.email_placeholder")}
          defaultValue={actionData?.email ?? ""}
          key={actionData?.email ?? "initial-email"}
          error={emailError}
        />
        <Input
          id="password"
          ref={passwordRef}
          name="password"
          type="password"
          size="lg"
          autoComplete="current-password"
          required
          requiredMark={false}
          label={t("auth.password")}
          error={passwordError}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={isSubmitting}>
          {isSubmitting ? t("auth.signing_in") : t("auth.sign_in")}
        </Button>
      </Form>

      {hasSso ? (
        <>
          <div className="flex items-center gap-2.5 text-[12px] leading-none text-fg-muted">
            <span className="h-px flex-1 bg-line" />
            {t("auth.or_continue_with")}
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-2">
            {hasGoogle ? (
              <Form method="post" action="/auth/google">
                {redirectInput}
                <Button type="submit" size="lg" fullWidth data-testid="sso-google">
                  {t("auth.continue_with_google")}
                </Button>
              </Form>
            ) : null}
            {hasMicrosoft ? (
              <Form method="post" action="/auth/microsoft">
                {redirectInput}
                <Button type="submit" size="lg" fullWidth data-testid="sso-microsoft">
                  {t("auth.continue_with_microsoft")}
                </Button>
              </Form>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="m-0 text-center text-[12px] leading-normal text-fg-muted">{t("auth.no_account")}</p>
    </AuthFrame>
  );
}
