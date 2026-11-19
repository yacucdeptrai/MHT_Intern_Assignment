import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useParams } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectReportsLoader } from "../loaders/projectReportsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Project Reports — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectReportsLoader(ctx, request, projectId);
}

export default function ProjectReportsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const { tab, memberReport, projectReport, sprints, filters, permissions } = useLoaderData<typeof loader>();
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const currentTab = tab;

  const handleExportXlsx = async () => {
    if (!projectId) return;
    setIsExportingXlsx(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export?format=rows`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(t("project_reports.err_forbidden_export"));
        }
        throw new Error(t("project_reports.err_failed_export"));
      }
      const data = await res.json<{ columns: string[]; rows: string[][]; fileName: string }>();
      const { buildXlsx } = await import("../utils/xlsxExport.client");
      const bytes = await buildXlsx(data.columns, data.rows);
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("project_reports.err_failed_export_xlsx"));
    } finally {
      setIsExportingXlsx(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="project-reports-page">
      {exportError && (
        <div
          role="alert"
          data-testid="export-error-msg"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200"
        >
          {exportError}
        </div>
      )}

      {/* Header and Tab Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t("project_reports.title")}</h2>
          <p className="text-sm text-gray-500">{t("project_reports.subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {permissions.canExportProject && projectId && (
            <div className="flex items-center gap-2">
              <a
                href={`/api/projects/${projectId}/export?format=csv`}
                download
                data-testid="export-csv-btn"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                {t("project_reports.btn_export_csv")}
              </a>
              <button
                type="button"
                onClick={() => {
                  void handleExportXlsx();
                }}
                disabled={isExportingXlsx}
                data-testid="export-xlsx-btn"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExportingXlsx ? t("project_reports.btn_exporting") : t("project_reports.btn_export_xlsx")}
              </button>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {permissions.canViewMemberReport && (
              <Link
                to="?tab=members"
                data-testid="tab-members"
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentTab === "members"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {t("project_reports.tab_members")}
              </Link>
            )}
            {permissions.canViewProjectReport && (
              <Link
                to="?tab=project"
                data-testid="tab-project"
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentTab === "project"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {t("project_reports.tab_project")}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Member Report Tab */}
      {currentTab === "members" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <Form method="get" className="flex flex-wrap items-end gap-4" data-testid="member-report-filters">
              <input type="hidden" name="tab" value="members" />

              <div className="flex flex-col gap-1">
                <label htmlFor="sprintId" className="text-xs font-semibold text-gray-700">
                  {t("project_reports.filter_sprint")}
                </label>
                <select
                  id="sprintId"
                  name="sprintId"
                  defaultValue={filters.sprintId ?? ""}
                  data-testid="sprint-filter-select"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t("project_reports.filter_all_sprints")}</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="from" className="text-xs font-semibold text-gray-700">
                  {t("project_reports.filter_completed_from")}
                </label>
                <input
                  type="date"
                  id="from"
                  name="from"
                  defaultValue={filters.from ?? ""}
                  data-testid="from-date-filter"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="to" className="text-xs font-semibold text-gray-700">
                  {t("project_reports.filter_completed_to")}
                </label>
                <input
                  type="date"
                  id="to"
                  name="to"
                  defaultValue={filters.to ?? ""}
                  data-testid="to-date-filter"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  data-testid="apply-filters-button"
                  className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {t("project_reports.btn_apply_filters")}
                </button>
                {(filters.sprintId || filters.from || filters.to) && (
                  <Link
                    to="?tab=members"
                    data-testid="clear-filters-button"
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {t("project_reports.btn_clear_filters")}
                  </Link>
                )}
              </div>
            </Form>
          </div>

          {/* Members Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200" data-testid="member-report-table">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_member")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_role")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_todo")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_in_progress")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_review")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_done")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-900"
                    >
                      {t("project_reports.th_total")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-600"
                    >
                      {t("project_reports.th_overdue")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-green-700"
                    >
                      {t("project_reports.th_completed_in_range")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {!memberReport || memberReport.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                        {t("project_reports.no_members")}
                      </td>
                    </tr>
                  ) : (
                    memberReport.map((row) => (
                      <tr
                        key={row.userId}
                        data-testid={`member-report-row-${row.userId}`}
                        className="hover:bg-gray-50/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-gray-900">{row.fullName}</div>
                          <div className="text-xs text-gray-500">{row.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-gray-600">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                            {row.projectRole}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                          {row.todoCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-blue-600 font-medium">
                          {row.inProgressCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-amber-600 font-medium">
                          {row.reviewCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-green-600 font-medium">
                          {row.doneCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-gray-900">
                          {row.totalAssigned}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium text-red-600">
                          {row.overdueCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              {row.overdueCount}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-green-700">
                          {row.completedInRangeCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                              {row.completedInRangeCount}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Project Report Tab (FR-31) */}
      {currentTab === "project" && projectReport && (
        <div data-testid="project-report-section" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="kpi-completion-rate">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t("project_reports.kpi_completion_rate")}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-gray-900">{projectReport.completionRate}%</span>
                <span className="text-xs text-gray-500">
                  {t("project_reports.kpi_completion_ratio", {
                    done: projectReport.doneTasks,
                    total: projectReport.totalTasks,
                  })}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${projectReport.completionRate}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="kpi-total-tasks">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t("project_reports.kpi_total_tasks")}
              </div>
              <div className="mt-2 text-3xl font-extrabold text-gray-900">{projectReport.totalTasks}</div>
              <div className="mt-3 text-xs text-gray-500">{t("project_reports.kpi_total_tasks_desc")}</div>
            </div>

            <div
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              data-testid="kpi-bottlenecks-count"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t("project_reports.kpi_bottlenecks")}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-amber-600">
                  {projectReport.bottlenecks.staleReviews.length}
                </span>
                <span className="text-xs text-gray-500">{t("project_reports.kpi_stale_reviews")}</span>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {t("project_reports.kpi_overdue_tasks", {
                  count: projectReport.bottlenecks.overdueByStatus.reduce((acc, s) => acc + s.overdueCount, 0),
                })}
              </div>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="status-distribution">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                {t("project_reports.status_distribution_title")}
              </h3>
              <p className="text-xs text-gray-500">{t("project_reports.status_distribution_desc")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_status")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_category")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_count")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_share")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {projectReport.statusDistribution.map((item) => (
                    <tr
                      key={item.statusId}
                      data-testid={`status-dist-row-${item.statusId}`}
                      className="hover:bg-gray-50/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {item.statusName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-gray-900">
                        {item.taskCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-36 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full bg-blue-500" style={{ width: `${item.percentage}%` }} />
                          </div>
                          <span className="w-10 text-xs font-medium text-gray-700">{item.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sprint Completion (P11) */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="sprint-completion-section">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">{t("project_reports.sprint_completion_title")}</h3>
              <p className="text-xs text-gray-500">{t("project_reports.sprint_completion_desc")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_sprint")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_status")}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_dates")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {t("project_reports.th_completion_rate")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {projectReport.sprintCompletion.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                        {t("project_reports.no_sprints")}
                      </td>
                    </tr>
                  ) : (
                    projectReport.sprintCompletion.map((sprint) => (
                      <tr
                        key={sprint.id}
                        data-testid={`sprint-completion-row-${sprint.id}`}
                        className="hover:bg-gray-50/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{sprint.name}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              sprint.status === "ACTIVE"
                                ? "bg-green-50 text-green-700 ring-green-600/20"
                                : sprint.status === "COMPLETED"
                                  ? "bg-gray-100 text-gray-700 ring-gray-500/20"
                                  : "bg-blue-50 text-blue-700 ring-blue-600/20"
                            }`}
                          >
                            {sprint.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500">
                          {t("project_reports.date_range", { start: sprint.startDate, end: sprint.endDate })}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm" data-testid="sprint-completion-value">
                          {sprint.completionRate === null ? (
                            <span className="text-gray-400 font-medium italic">{t("project_reports.no_tasks")}</span>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full bg-green-500" style={{ width: `${sprint.completionRate}%` }} />
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{sprint.completionRate}%</span>
                              <span className="text-xs text-gray-500">
                                {t("project_reports.tasks_done_ratio", {
                                  completed: sprint.completedCount,
                                  total: sprint.taskCount,
                                })}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottlenecks Section (P21) */}
          <div className="space-y-6" data-testid="bottlenecks-section">
            <h3 className="text-lg font-bold text-gray-900">{t("project_reports.bottlenecks_title")}</h3>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Stale Reviews (FR-31 c3) */}
              <div
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                data-testid="stale-reviews-section"
              >
                <div className="border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">
                        {t("project_reports.stale_reviews_title")}
                      </h4>
                      <p className="text-xs text-gray-500">{t("project_reports.stale_reviews_desc")}</p>
                    </div>
                    {projectReport.bottlenecks.staleReviews.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        {t("project_reports.stale_reviews_pending", {
                          count: projectReport.bottlenecks.staleReviews.length,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" data-testid="stale-reviews-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                        >
                          {t("project_reports.th_task")}
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                        >
                          {t("project_reports.th_time_in_review")}
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                        >
                          {t("project_reports.th_assignees")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {projectReport.bottlenecks.staleReviews.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">
                            {t("project_reports.no_stale_reviews")}
                          </td>
                        </tr>
                      ) : (
                        projectReport.bottlenecks.staleReviews.map((task) => (
                          <tr
                            key={task.taskId}
                            data-testid={`stale-review-row-${task.taskId}`}
                            className="hover:bg-gray-50/50"
                          >
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              <div className="truncate max-w-xs">{task.title}</div>
                              <div className="text-xs text-gray-500">{task.statusName}</div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-right text-xs">
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                {t("project_reports.days_in_review", { days: task.daysInReview })}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-xs text-gray-500">
                              {task.assignees.length === 0 ? (
                                <span className="italic text-gray-400">{t("project_reports.unassigned")}</span>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  {task.assignees.map((a) => (
                                    <span key={a.id} className="font-medium text-gray-800">
                                      {a.fullName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Overdue by Status */}
              <div
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                data-testid="overdue-by-status-section"
              >
                <div className="border-b border-gray-200 px-6 py-4">
                  <h4 className="text-base font-semibold text-gray-900">
                    {t("project_reports.overdue_by_status_title")}
                  </h4>
                  <p className="text-xs text-gray-500">{t("project_reports.overdue_by_status_desc")}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" data-testid="overdue-by-status-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                        >
                          {t("project_reports.th_status")}
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                        >
                          {t("project_reports.th_category")}
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-600"
                        >
                          {t("project_reports.th_overdue_count")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {projectReport.bottlenecks.overdueByStatus.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">
                            {t("project_reports.no_overdue_tasks")}
                          </td>
                        </tr>
                      ) : (
                        projectReport.bottlenecks.overdueByStatus.map((item) => (
                          <tr
                            key={item.statusId}
                            data-testid={`overdue-status-row-${item.statusId}`}
                            className="hover:bg-gray-50/50"
                          >
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {item.statusName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-xs">
                              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                {item.category}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-red-600">
                              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
                                {item.overdueCount}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
