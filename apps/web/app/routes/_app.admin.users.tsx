import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";

import type { UserAdminRow } from "@pm/domain";
import { APP_NAME } from "@pm/domain";

import { adminUsersAction } from "../actions/adminUsersAction";
import { adminUsersLoader } from "../loaders/adminUsersLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `User Management — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminUsersLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminUsersAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
  inviteUrl?: string;
  user?: UserAdminRow;
}

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAdminRow | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [prevActionData, setPrevActionData] = useState(actionData);

  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsCreateOpen(false);
      setEditingUser(null);
    }
  }

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const createEmailError = actionData?.errors?.email?.[0];
  const createNameError = actionData?.errors?.fullName?.[0];

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
      }, 2000);
    } catch {
      // Fallback if clipboard API is unavailable
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin_users.title")}</h1>
            <p className="text-sm text-gray-600">{t("admin_users.subtitle")}</p>
          </div>
          <div>
            <button
              type="button"
              data-testid="btn-open-create-user"
              onClick={() => {
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t("admin_users.btn_create_user")}
            </button>
          </div>
        </div>

        {/* Global Error Alert */}
        {formError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {formError}
          </div>
        ) : null}

        {/* Invite Link Success Banner */}
        {actionData?.success && actionData.inviteUrl ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
            <h3 className="text-sm font-semibold text-green-800">{t("admin_users.success_created_title")}</h3>
            <p className="mt-1 text-sm text-green-700">{t("admin_users.success_created_desc")}</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={actionData.inviteUrl}
                className="w-full max-w-xl rounded-md border border-green-300 bg-white px-3 py-1.5 text-sm text-gray-800"
              />
              <button
                type="button"
                onClick={() => {
                  void handleCopyLink(actionData.inviteUrl ?? "");
                }}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
              >
                {copiedLink ? t("admin_users.btn_copied") : t("admin_users.btn_copy_link")}
              </button>
            </div>
          </div>
        ) : null}

        {/* Search & Filter Bar */}
        <Form method="get" className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="min-w-[200px] flex-1">
            <input
              type="search"
              name="q"
              defaultValue={searchParams.get("q") ?? ""}
              placeholder={t("admin_users.search_placeholder")}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <select
              name="status"
              defaultValue={searchParams.get("status") ?? ""}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t("admin_users.filter_all_statuses")}</option>
              <option value="ACTIVE">{t("admin_users.filter_status_active")}</option>
              <option value="LOCKED">{t("admin_users.filter_status_locked")}</option>
            </select>
          </div>

          <div>
            <select
              name="systemRole"
              defaultValue={searchParams.get("systemRole") ?? ""}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t("admin_users.filter_all_roles")}</option>
              <option value="ADMIN">{t("admin_users.filter_role_admin")}</option>
              <option value="PM">{t("admin_users.filter_role_pm")}</option>
              <option value="TEAM_LEAD">{t("admin_users.filter_role_team_lead")}</option>
              <option value="MEMBER">{t("admin_users.filter_role_member")}</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            {t("admin_users.btn_filter")}
          </button>
        </Form>

        {/* Users Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3">{t("admin_users.th_full_name")}</th>
                <th className="px-6 py-3">{t("admin_users.th_email")}</th>
                <th className="px-6 py-3">{t("admin_users.th_role")}</th>
                <th className="px-6 py-3">{t("admin_users.th_department")}</th>
                <th className="px-6 py-3">{t("admin_users.th_status")}</th>
                <th className="px-6 py-3 text-right">{t("admin_users.th_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loaderData.users.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {t("admin_users.no_users_found")}
                  </td>
                </tr>
              ) : (
                loaderData.users.items.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{u.fullName}</td>
                    <td className="whitespace-nowrap px-6 py-4">{u.email}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {u.systemRole}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{u.department ?? "—"}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(u);
                          }}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          {t("admin_users.btn_edit")}
                        </button>

                        <Form method="post" className="inline">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="intent" value={u.status === "ACTIVE" ? "lock" : "unlock"} />
                          <button
                            type="submit"
                            data-testid={`btn-toggle-status-${u.id}`}
                            disabled={isSubmitting}
                            className={`rounded px-2 py-1 text-xs font-medium ${
                              u.status === "ACTIVE"
                                ? "text-amber-600 hover:bg-amber-50"
                                : "text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {u.status === "ACTIVE" ? t("admin_users.btn_lock") : t("admin_users.btn_unlock")}
                          </button>
                        </Form>

                        <Form
                          method="post"
                          className="inline"
                          onSubmit={(e) => {
                            if (!confirm(t("admin_users.confirm_delete", { name: u.fullName }))) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="intent" value="delete" />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            {t("admin_users.btn_delete")}
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Create User Modal */}
        {isCreateOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-lg font-semibold text-gray-900">{t("admin_users.modal_create_title")}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t("admin_users.modal_close")}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>

              <Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="create" />

                <div>
                  <label htmlFor="create-fullName" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_full_name")}
                  </label>
                  <input
                    id="create-fullName"
                    type="text"
                    name="fullName"
                    required
                    defaultValue={actionData?.values?.fullName ?? ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {createNameError ? <p className="mt-1 text-xs text-red-600">{createNameError}</p> : null}
                </div>

                <div>
                  <label htmlFor="create-email" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_email")}
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    name="email"
                    required
                    defaultValue={actionData?.values?.email ?? ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {createEmailError ? (
                    <p data-testid="error-create-email" className="mt-1 text-xs text-red-600">
                      {createEmailError}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="create-systemRole" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_system_role")}
                  </label>
                  <select
                    id="create-systemRole"
                    name="systemRole"
                    defaultValue={actionData?.values?.systemRole ?? "MEMBER"}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="MEMBER">{t("admin_users.role_member")}</option>
                    <option value="TEAM_LEAD">{t("admin_users.role_team_lead")}</option>
                    <option value="PM">{t("admin_users.role_pm")}</option>
                    <option value="ADMIN">{t("admin_users.role_admin")}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="create-department" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_department")}
                  </label>
                  <input
                    id="create-department"
                    type="text"
                    name="department"
                    defaultValue={actionData?.values?.department ?? ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                    }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("admin_users.btn_cancel")}
                  </button>
                  <button
                    type="submit"
                    data-testid="btn-submit-create-user"
                    disabled={isSubmitting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {isSubmitting ? t("admin_users.btn_creating") : t("admin_users.btn_submit_create")}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        ) : null}

        {/* Edit User Modal */}
        {editingUser ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("admin_users.modal_edit_title", { name: editingUser.fullName })}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t("admin_users.modal_close")}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>

              <Form
                method="post"
                className="mt-4 space-y-4"
                onSubmit={() => {
                  setEditingUser(null);
                }}
              >
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="userId" value={editingUser.id} />

                <div>
                  <label htmlFor="edit-fullName" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_full_name")}
                  </label>
                  <input
                    id="edit-fullName"
                    type="text"
                    name="fullName"
                    required
                    defaultValue={editingUser.fullName}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_email")}
                  </label>
                  <input
                    id="edit-email"
                    type="email"
                    name="email"
                    required
                    defaultValue={editingUser.email}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="edit-systemRole" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_system_role")}
                  </label>
                  <select
                    id="edit-systemRole"
                    name="systemRole"
                    defaultValue={editingUser.systemRole}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="MEMBER">{t("admin_users.role_member")}</option>
                    <option value="TEAM_LEAD">{t("admin_users.role_team_lead")}</option>
                    <option value="PM">{t("admin_users.role_pm")}</option>
                    <option value="ADMIN">{t("admin_users.role_admin")}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-department" className="block text-sm font-medium text-gray-700">
                    {t("admin_users.label_department_edit")}
                  </label>
                  <input
                    id="edit-department"
                    type="text"
                    name="department"
                    defaultValue={editingUser.department ?? ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null);
                    }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("admin_users.btn_cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {isSubmitting ? t("admin_users.btn_saving") : t("admin_users.btn_save_changes")}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
