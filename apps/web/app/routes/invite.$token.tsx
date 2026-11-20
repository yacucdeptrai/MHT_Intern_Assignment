import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { AcceptInviteSchema, APP_NAME, PASSWORD_MIN_LENGTH } from "@pm/domain";

import { AuthFrame, AuthHeading } from "../components/layouts/AuthFrame";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { inviteService } from "../services/invite.service";
import { handleActionError } from "../utils/errors.server";
import { formatShortDate } from "../utils/format";
import { requestContextKey } from "../utils/requestContext.server";
import { commitSession, getSession, isRequestSecure } from "../utils/session.server";

export function meta() {
  return [{ title: `Accept invitation | ${APP_NAME}` }];
}

export async function loader({ context, params }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const token = params.token ?? "";
  const validation = await inviteService.validateToken(ctx, token);

  return {
    status: validation.status,
    email: validation.email,
    projectName: validation.projectName,
    expiresAt: validation.expiresAt,
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
  const { t, i18n } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; errors?: Record<string, string[]>; message?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [prevActionData, setPrevActionData] = useState(actionData);
  // A failed submit clears both password fields (never echo a rejected password back).
  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData && !actionData.success) {
      setPassword("");
      setConfirmPassword("");
    }
  }

  if (loaderData.status === "invalid") {
    return (
      <AuthFrame>
        <AuthHeading title={t("invite.invalid_title")} description={t("invite.invalid_description")} />
      </AuthFrame>
    );
  }

  const isTooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const isMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length > 0 && confirmPassword.length > 0 && !isTooShort && !isMismatch;

  const passwordError =
    (isTooShort ? t("invite.error_short", { min: PASSWORD_MIN_LENGTH }) : undefined) ??
    actionData?.errors?.password?.[0];
  const confirmPasswordError =
    (isMismatch ? t("invite.error_mismatch") : undefined) ?? actionData?.errors?.confirmPassword?.[0];
  const formError = actionData?.message ?? actionData?.errors?.form?.[0];
  const joinTarget = loaderData.projectName ?? t("auth.title");

  return (
    <AuthFrame>
      <AuthHeading
        title={t("invite.title")}
        description={
          <>
            {t("invite.set_password_for")} <span className="font-medium text-fg">{loaderData.email}</span>{" "}
            {t("invite.to_join")} <span className="font-medium text-fg">{joinTarget}</span>.
          </>
        }
      />

      {formError ? (
        <Banner tone="danger" role="alert">
          {formError}
        </Banner>
      ) : null}

      <Form method="post" className="flex flex-col gap-4">
        <Input
          id="password"
          name="password"
          type="password"
          size="lg"
          required
          requiredMark={false}
          autoComplete="new-password"
          label={t("invite.new_password")}
          placeholder={t("invite.new_password_placeholder")}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={passwordError}
        />
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          size="lg"
          required
          requiredMark={false}
          autoComplete="new-password"
          label={t("invite.confirm_password")}
          placeholder={t("invite.confirm_password_placeholder")}
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
          }}
          error={confirmPasswordError}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? t("invite.submitting") : t("invite.submit")}
        </Button>
      </Form>

      {loaderData.expiresAt ? (
        <p className="m-0 text-center text-[12px] leading-normal text-fg-muted" data-testid="invite-expiry">
          {t("invite.expires_note", { date: formatShortDate(loaderData.expiresAt, i18n.language) })}
        </p>
      ) : null}
    </AuthFrame>
  );
}
