import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { profileAction, type ProfileActionData } from "../actions/profileAction";
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
  const { profile, memberships, hasPassword } = useLoaderData<typeof loader>();
  const actionData = useActionData<ProfileActionData>();
  const navigation = useNavigation();
  const avatarFetcher = useFetcher<{ success?: boolean; errors?: Record<string, string[]> }>();

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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8" data-testid="profile-page">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your personal information, avatar, and security settings.</p>
      </div>

      {actionData?.success && (
        <div className="p-4 rounded-md bg-green-50 border border-green-200 text-sm text-green-800" role="status">
          {actionData.message ?? "Profile updated successfully."}
        </div>
      )}

      {profileError && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {profileError}
        </div>
      )}

      {/* Avatar Section */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Profile Photo</h2>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <img
              src={
                avatarPreviewKey > 0 ? `/api/avatars/${profile.id}?t=${avatarPreviewKey}` : `/api/avatars/${profile.id}`
              }
              alt={profile.fullName}
              className="h-24 w-24 rounded-full object-cover border-2 border-gray-200 shadow-sm"
              data-testid="avatar-image"
            />
          </div>

          <div className="flex-1 space-y-2">
            <avatarFetcher.Form
              method="post"
              action={`/api/avatars/${profile.id}`}
              encType="multipart/form-data"
              className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
              onSubmit={() => {
                setTimeout(() => {
                  setAvatarPreviewKey(Date.now());
                }, 500);
              }}
            >
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                data-testid="avatar-file-input"
              />
              <button
                type="submit"
                disabled={isAvatarUploading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                data-testid="avatar-upload-button"
              >
                {isAvatarUploading ? "Uploading..." : "Upload Photo"}
              </button>
            </avatarFetcher.Form>
            <p className="text-xs text-gray-500">PNG, JPEG, or WebP up to 10 MB.</p>
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>
      </section>

      {/* Personal Information Form */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
          <p className="text-xs text-gray-500 mt-0.5">Contact details and organization attributes.</p>
        </div>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="updateProfile" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                defaultValue={actionData?.values?.fullName ?? profile.fullName}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="profile-fullname-input"
              />
              {fullNameError && <p className="mt-1 text-xs text-red-600">{fullNameError}</p>}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={actionData?.values?.phone ?? profile.phone ?? ""}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="profile-phone-input"
              />
              {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-500">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                disabled
                defaultValue={profile.email}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed shadow-sm"
                data-testid="profile-email-readonly"
              />
              <p className="mt-1 text-xs text-gray-400">Email cannot be changed directly.</p>
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-500">
                Department
              </label>
              <input
                id="department"
                type="text"
                disabled
                defaultValue={profile.department ?? "—"}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed shadow-sm"
                data-testid="profile-department-readonly"
              />
              <p className="mt-1 text-xs text-gray-400">Department is managed by administrators.</p>
            </div>

            <div>
              <label htmlFor="systemRole" className="block text-sm font-medium text-gray-500">
                System Role
              </label>
              <input
                id="systemRole"
                type="text"
                disabled
                defaultValue={profile.systemRole}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed shadow-sm"
                data-testid="profile-role-readonly"
              />
              <p className="mt-1 text-xs text-gray-400">Role permissions are configured by administrators.</p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isProfileSubmitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              data-testid="profile-save-button"
            >
              {isProfileSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </Form>
      </section>

      {/* Password Management */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {hasPassword ? "Change Password" : "Set Account Password"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {hasPassword
              ? "Ensure your account is using a long, secure password (at least 10 characters)."
              : "You currently sign in via SSO. Setting a password allows signing in with your email and password."}
          </p>
        </div>

        <Form method="post" className="space-y-4 max-w-md">
          <input type="hidden" name="intent" value="changePassword" />

          {hasPassword && (
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                Current Password
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="current-password-input"
              />
              {currentPasswordError && <p className="mt-1 text-xs text-red-600">{currentPasswordError}</p>}
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              minLength={10}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="new-password-input"
            />
            {newPasswordError && <p className="mt-1 text-xs text-red-600">{newPasswordError}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              minLength={10}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="confirm-password-input"
            />
            {confirmPasswordError && <p className="mt-1 text-xs text-red-600">{confirmPasswordError}</p>}
          </div>

          <button
            type="submit"
            disabled={isPasswordSubmitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            data-testid="change-password-button"
          >
            {isPasswordSubmitting ? "Updating..." : hasPassword ? "Update Password" : "Set Password"}
          </button>
        </Form>
      </section>

      {/* Project Memberships */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Project Memberships</h2>
          <p className="text-xs text-gray-500 mt-0.5">Projects you are assigned to and your role in each.</p>
        </div>

        {memberships.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500">You are not a member of any projects yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Project Code</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {memberships.map((m) => (
                  <tr key={m.projectId}>
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{m.projectCode}</td>
                    <td className="px-4 py-3 text-gray-700">{m.projectName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                        {m.projectRole}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
