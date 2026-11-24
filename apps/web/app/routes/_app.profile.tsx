import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData, useNavigate, useNavigation } from "react-router";

import { APP_NAME, type MembershipDto } from "@pm/domain";

import { profileAction, type ProfileActionData } from "../actions/profileAction";
import { Avatar } from "../components/ui/Avatar";
import { Badge, roleTone } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Page } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Section } from "../components/ui/Section";
import { Table } from "../components/ui/Table";
import { Toast } from "../components/ui/Toast";
import { translateRole } from "../i18n/labels";
import { profileLoader } from "../loaders/profileLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Profile — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return profileLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return profileAction(ctx, request);
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, memberships, hasPassword } = useLoaderData<typeof loader>();
  const actionData = useActionData<ProfileActionData>();
  const navigation = useNavigation();
  const avatarFetcher = useFetcher<{ success?: boolean; errors?: Record<string, string[]> }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProfileSubmitting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "updateProfile";
  const isPasswordSubmitting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "changePassword";
  const isAvatarUploading = avatarFetcher.state === "submitting";

  const [avatarPreviewKey, setAvatarPreviewKey] = useState<number>(0);

  const profileError = actionData?.errors?.form?.[0];
  const fullNameError = actionData?.errors?.fullName?.[0];
  const phoneError = actionData?.errors?.phone?.[0];

  const currentPasswordError = actionData?.errors?.currentPassword?.[0];
  const newPasswordError = actionData?.errors?.newPassword?.[0];
  const confirmPasswordError = actionData?.errors?.confirmPassword?.[0];
  const avatarError = avatarFetcher.data?.errors?.file?.[0] ?? avatarFetcher.data?.errors?.form?.[0];

  // The password action returns a message; the profile action does not.
  const toastText = actionData?.success
    ? actionData.message
      ? t("profile.msg_password_updated")
      : t("profile.msg_profile_updated")
    : null;

  const hasAvatar = Boolean(profile.avatarKey) || avatarPreviewKey > 0;
  const avatarSrc = hasAvatar
    ? avatarPreviewKey > 0
      ? `/api/avatars/${profile.id}?t=${String(avatarPreviewKey)}`
      : `/api/avatars/${profile.id}`
    : null;

  return (
    <div data-testid="profile-page" className="flex min-h-full flex-col">
      <Page maxWidth={880} header={<PageHeader title={t("profile.title")} description={t("profile.subtitle")} />}>
        {profileError ? (
          <Banner tone="danger" role="alert">
            {profileError}
          </Banner>
        ) : null}

        <div>
          <Section title={t("profile.photo_title")} description={t("profile.photo_hint")}>
            <avatarFetcher.Form
              method="post"
              action={`/api/avatars/${profile.id}`}
              encType="multipart/form-data"
              className="flex items-center gap-3.5"
              onChange={(event) => {
                void avatarFetcher.submit(event.currentTarget);
                setTimeout(() => {
                  setAvatarPreviewKey(Date.now());
                }, 500);
              }}
            >
              <Avatar name={profile.fullName} src={avatarSrc} size={56} data-testid="avatar-image" />
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-label={t("profile.btn_upload_photo")}
                data-testid="avatar-file-input"
              />
              <Button
                size="sm"
                icon="upload"
                disabled={isAvatarUploading}
                onClick={() => fileInputRef.current?.click()}
                data-testid="avatar-upload-button"
              >
                {isAvatarUploading ? t("profile.btn_uploading") : t("profile.btn_upload_photo")}
              </Button>
            </avatarFetcher.Form>
            {avatarError ? <span className="text-[11.5px] leading-[1.35] text-danger">{avatarError}</span> : null}
          </Section>

          <Section title={t("profile.personal_info_title")} description={t("profile.personal_info_subtitle")}>
            <Form method="post" className="flex flex-col gap-3.5">
              <input type="hidden" name="intent" value="updateProfile" />
              <div className="grid grid-cols-2 gap-3.5">
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  requiredMark={false}
                  label={t("profile.label_fullname")}
                  defaultValue={actionData?.values?.fullName ?? profile.fullName}
                  error={fullNameError}
                  data-testid="profile-fullname-input"
                />
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  label={t("profile.label_phone")}
                  defaultValue={actionData?.values?.phone ?? profile.phone ?? ""}
                  error={phoneError}
                  data-testid="profile-phone-input"
                />
                <Input
                  id="email"
                  type="email"
                  disabled
                  label={t("profile.label_email")}
                  defaultValue={profile.email}
                  hint={t("profile.hint_email")}
                  data-testid="profile-email-readonly"
                />
                <Input
                  id="department"
                  disabled
                  label={t("profile.label_department")}
                  defaultValue={profile.department ?? "—"}
                  hint={t("profile.hint_department")}
                  data-testid="profile-department-readonly"
                />
                <Input
                  id="systemRole"
                  disabled
                  label={t("profile.label_system_role")}
                  defaultValue={translateRole(t, profile.systemRole)}
                  hint={t("profile.hint_system_role")}
                  data-testid="profile-role-readonly"
                />
              </div>
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProfileSubmitting}
                  data-testid="profile-save-button"
                >
                  {isProfileSubmitting ? t("profile.btn_saving") : t("profile.btn_save_changes")}
                </Button>
              </div>
            </Form>
          </Section>

          <Section
            title={hasPassword ? t("profile.security_change_pwd") : t("profile.security_set_pwd")}
            description={hasPassword ? t("profile.hint_has_pwd") : t("profile.hint_no_pwd")}
          >
            <Form method="post" className="flex flex-col gap-3.5">
              <input type="hidden" name="intent" value="changePassword" />
              <div className="grid grid-cols-2 gap-3.5">
                {hasPassword ? (
                  <>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      required
                      requiredMark={false}
                      autoComplete="current-password"
                      label={t("profile.label_current_pwd")}
                      error={currentPasswordError}
                      data-testid="current-password-input"
                    />
                    <span />
                  </>
                ) : null}
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  minLength={10}
                  required
                  requiredMark={false}
                  autoComplete="new-password"
                  label={t("profile.label_new_pwd")}
                  placeholder={t("profile.placeholder_new_pwd")}
                  error={newPasswordError}
                  data-testid="new-password-input"
                />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  minLength={10}
                  required
                  requiredMark={false}
                  autoComplete="new-password"
                  label={t("profile.label_confirm_pwd")}
                  error={confirmPasswordError}
                  data-testid="confirm-password-input"
                />
              </div>
              <div>
                <Button type="submit" size="sm" disabled={isPasswordSubmitting} data-testid="change-password-button">
                  {isPasswordSubmitting
                    ? t("profile.btn_updating_pwd")
                    : hasPassword
                      ? t("profile.btn_update_pwd")
                      : t("profile.btn_set_pwd")}
                </Button>
              </div>
            </Form>
          </Section>

          <Section title={t("profile.memberships_title")} description={t("profile.memberships_subtitle")}>
            <div className="overflow-hidden rounded-lg border border-line">
              <Table<MembershipDto>
                dense
                data-testid="profile-memberships"
                rows={memberships}
                rowKey={(row) => row.projectId}
                onRowClick={(row) => {
                  void navigate(`/projects/${row.projectId}`);
                }}
                empty={t("profile.empty_memberships")}
                columns={[
                  {
                    id: "code",
                    label: t("profile.th_project_code"),
                    width: 70,
                    render: (row) => <Badge tone="accent">{row.projectCode}</Badge>,
                  },
                  {
                    id: "name",
                    label: t("profile.th_name"),
                    render: (row) => <span className="font-medium">{row.projectName}</span>,
                  },
                  {
                    id: "role",
                    label: t("profile.th_role"),
                    render: (row) => (
                      <Badge tone={roleTone(row.projectRole)}>{translateRole(t, row.projectRole)}</Badge>
                    ),
                  },
                ]}
              />
            </div>
          </Section>
        </div>
      </Page>
      <Toast text={toastText} id={actionData} />
    </div>
  );
}
