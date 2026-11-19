import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME, STATUS_CATEGORIES, type StatusCategory } from "@pm/domain";

import { adminStatusesAction } from "../actions/adminStatusesAction";
import { adminStatusesLoader, type StatusAdminRow } from "../loaders/adminStatusesLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Status Configuration — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminStatusesLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminStatusesAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
  status?: StatusAdminRow;
}

export default function AdminStatusesPage() {
  const { t } = useTranslation();
  const { statuses } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusAdminRow | null>(null);

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const nameError = actionData?.errors?.name?.[0];
  const categoryError = actionData?.errors?.category?.[0];

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= statuses.length) return;

    const reordered = [...statuses];
    const moved = reordered[index];
    if (!moved) return;
    reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const form = document.createElement("form");
    form.method = "post";
    form.style.display = "none";

    const intentInput = document.createElement("input");
    intentInput.name = "intent";
    intentInput.value = "reorder";
    form.appendChild(intentInput);

    for (const status of reordered) {
      const idInput = document.createElement("input");
      idInput.name = "orderedIds";
      idInput.value = status.id;
      form.appendChild(idInput);
    }

    document.body.appendChild(form);
    form.requestSubmit();
    document.body.removeChild(form);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t("admin_statuses.title")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_statuses.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {t("admin_statuses.btn_add_status")}
        </button>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{formError}</div>
      )}

      {/* Statuses Table */}
      <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_order")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_name")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_category")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_default")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_tasks")}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_statuses.th_actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {statuses.map((status, index) => (
              <tr key={status.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      disabled={index === 0 || isSubmitting}
                      onClick={() => {
                        handleMove(index, "up");
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={t("admin_statuses.aria_move_up")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === statuses.length - 1 || isSubmitting}
                      onClick={() => {
                        handleMove(index, "down");
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={t("admin_statuses.aria_move_down")}
                    >
                      ↓
                    </button>
                    <span className="font-mono text-xs">{status.position}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">
                  {status.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                    {status.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {status.isDefault ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {t("admin_statuses.badge_default")}
                    </span>
                  ) : (
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="setDefault" />
                      <input type="hidden" name="statusId" value={status.id} />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                      >
                        {t("admin_statuses.btn_set_default")}
                      </button>
                    </Form>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                  {status.taskCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStatus(status);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900"
                  >
                    {t("admin_statuses.btn_edit")}
                  </button>
                  {!status.isDefault && (
                    <Form
                      method="post"
                      className="inline"
                      onSubmit={(e) => {
                        if (!confirm(t("admin_statuses.confirm_delete", { name: status.name }))) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="statusId" value={status.id} />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 disabled:opacity-50"
                      >
                        {t("admin_statuses.btn_delete")}
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("admin_statuses.modal_add_title")}
            </h2>
            <Form
              method="post"
              className="space-y-4"
              onSubmit={() => {
                // Keep open until server returns success
              }}
            >
              <input type="hidden" name="intent" value="create" />
              <div>
                <label htmlFor="create-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("admin_statuses.label_status_name")}
                </label>
                <input
                  id="create-name"
                  type="text"
                  name="name"
                  required
                  defaultValue={actionData?.values?.name ?? ""}
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none"
                />
                {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
              </div>
              <div>
                <label
                  htmlFor="create-category"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {t("admin_statuses.label_category")}
                </label>
                <select
                  id="create-category"
                  name="category"
                  defaultValue={actionData?.values?.category ?? "TODO"}
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none"
                >
                  {STATUS_CATEGORIES.map((cat: StatusCategory) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {categoryError && <p className="mt-1 text-xs text-red-600">{categoryError}</p>}
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200"
                >
                  {t("admin_statuses.btn_cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? t("admin_statuses.btn_saving") : t("admin_statuses.btn_create")}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingStatus && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("admin_statuses.modal_edit_title")}
            </h2>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="statusId" value={editingStatus.id} />
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("admin_statuses.label_status_name")}
                </label>
                <input
                  id="edit-name"
                  type="text"
                  name="name"
                  required
                  defaultValue={editingStatus.name}
                  className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none"
                />
                {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingStatus(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200"
                >
                  {t("admin_statuses.btn_cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? t("admin_statuses.btn_saving") : t("admin_statuses.btn_update")}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
