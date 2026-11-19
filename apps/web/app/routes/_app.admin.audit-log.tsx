import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";

import { APP_NAME, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AdminAuditLogLoaderData } from "@pm/domain";

import { adminAuditLogLoader } from "../loaders/adminAuditLogLoader";
import { extractAuditDiffs, formatAuditTimestamp } from "../utils/formatAudit";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Audit Log — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminAuditLogLoader(ctx, request);
}

function buildPageHref(filters: AdminAuditLogLoaderData["filters"], targetPage: number): string {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(targetPage));
  return `/admin/audit-log?${params.toString()}`;
}

export default function AdminAuditLogPage() {
  const { t } = useTranslation();
  const { entries, filters, actors } = useLoaderData<typeof loader>();
  const startItem = entries.total === 0 ? 0 : (entries.page - 1) * entries.pageSize + 1;
  const endItem = Math.min(entries.page * entries.pageSize, entries.total);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin_audit.title")}</h1>
          <p className="text-sm text-gray-600">{t("admin_audit.subtitle")}</p>
        </div>

        <Form
          method="get"
          className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
          data-testid="audit-filter-form"
        >
          <div>
            <label htmlFor="audit-filter-actor" className="block text-xs font-medium text-gray-700">
              {t("admin_audit.label_actor")}
            </label>
            <select
              id="audit-filter-actor"
              name="actorId"
              defaultValue={filters.actorId ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="filter-actor"
            >
              <option value="">{t("admin_audit.all_actors")}</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.isDeleted ? t("admin_audit.deleted_user") : `${actor.fullName} (${actor.email})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audit-filter-entity-type" className="block text-xs font-medium text-gray-700">
              {t("admin_audit.label_entity_type")}
            </label>
            <select
              id="audit-filter-entity-type"
              name="entityType"
              defaultValue={filters.entityType ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="filter-entity-type"
            >
              <option value="">{t("admin_audit.all_entity_types")}</option>
              {AUDIT_ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audit-filter-action" className="block text-xs font-medium text-gray-700">
              {t("admin_audit.label_action")}
            </label>
            <select
              id="audit-filter-action"
              name="action"
              defaultValue={filters.action ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="filter-action"
            >
              <option value="">{t("admin_audit.all_actions")}</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audit-filter-from" className="block text-xs font-medium text-gray-700">
              {t("admin_audit.label_from_date")}
            </label>
            <input
              id="audit-filter-from"
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="filter-from"
            />
          </div>

          <div>
            <label htmlFor="audit-filter-to" className="block text-xs font-medium text-gray-700">
              {t("admin_audit.label_to_date")}
            </label>
            <input
              id="audit-filter-to"
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="filter-to"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              data-testid="btn-apply-audit-filters"
            >
              {t("admin_audit.btn_filter")}
            </button>
            <Link
              to="/admin/audit-log"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="btn-reset-audit-filters"
            >
              {t("admin_audit.btn_reset")}
            </Link>
          </div>
        </Form>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table
            className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-600"
            data-testid="audit-log-table"
          >
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3">{t("admin_audit.th_timestamp")}</th>
                <th className="px-6 py-3">{t("admin_audit.th_actor")}</th>
                <th className="px-6 py-3">{t("admin_audit.th_action")}</th>
                <th className="px-6 py-3">{t("admin_audit.th_entity")}</th>
                <th className="px-6 py-3">{t("admin_audit.th_changes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {entries.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500" data-testid="audit-empty-state">
                    {t("admin_audit.empty_audit")}
                  </td>
                </tr>
              ) : (
                entries.items.map((entry) => {
                  const { reason, diffs } = extractAuditDiffs(entry.changes);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50" data-testid="audit-log-row">
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-600">
                        {formatAuditTimestamp(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{entry.actorName}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                          {entry.action}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-gray-700">
                        <div className="font-semibold text-gray-900">{entry.entityType}</div>
                        <div className="font-mono text-gray-500">{entry.entityId}</div>
                        {entry.projectCode ? (
                          <div className="text-gray-500">
                            {t("admin_audit.project_prefix", { code: entry.projectCode })}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-700">
                        {reason ? (
                          <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-amber-900">
                            <span className="font-semibold">{t("admin_audit.reason_prefix")}</span> {reason}
                          </p>
                        ) : null}
                        {diffs.length === 0 && !reason ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {diffs.map((diff) => (
                              <li key={diff.field}>
                                <span className="font-medium text-gray-800">{diff.field}:</span>{" "}
                                <span className="text-gray-500">{diff.fromText}</span> <span aria-hidden="true">→</span>{" "}
                                <span className="font-medium text-gray-900">{diff.toText}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
          data-testid="audit-pagination"
        >
          <span>
            {t("admin_audit.pagination_showing", {
              start: startItem,
              end: endItem,
              total: entries.total,
              pageSize: entries.pageSize,
            })}
          </span>
          <div className="flex items-center gap-2">
            {entries.page > 1 ? (
              <Link
                to={buildPageHref(filters, entries.page - 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                data-testid="audit-prev-page"
              >
                {t("admin_audit.btn_previous")}
              </Link>
            ) : null}
            <span className="text-xs font-medium text-gray-700">
              {t("admin_audit.pagination_page", {
                page: entries.page,
                totalPages: entries.totalPages,
              })}
            </span>
            {entries.page < entries.totalPages ? (
              <Link
                to={buildPageHref(filters, entries.page + 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                data-testid="audit-next-page"
              >
                {t("admin_audit.btn_next")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
