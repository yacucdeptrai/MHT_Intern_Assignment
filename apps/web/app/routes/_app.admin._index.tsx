import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { adminDashboardLoader } from "../loaders/adminDashboardLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Admin Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return adminDashboardLoader(ctx, request);
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { user, projectsAtRisk, inProgress, todayPriorities, overdue, unreadCount } = useLoaderData<typeof loader>();
  const isAdmin = user.systemRole === "ADMIN";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8" data-testid="admin-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("admin_dashboard.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("admin_dashboard.subtitle", { name: user.fullName, role: user.systemRole })}
          </p>
        </div>

        {/* Unread Notifications Pill */}
        <div data-testid="unread-notifications-indicator">
          {unreadCount > 0 ? (
            <Link
              to="/notifications"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>
                {unreadCount === 1
                  ? t("admin_dashboard.unread_count_one", { count: unreadCount })
                  : t("admin_dashboard.unread_count_other", { count: unreadCount })}
              </span>
            </Link>
          ) : (
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <span>{t("admin_dashboard.notifications_up_to_date")}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Projects At Risk Section (FR-33 c3) */}
      <section
        className="rounded-xl border border-red-200 bg-white p-6 shadow-xs space-y-4"
        data-testid="projects-at-risk-section"
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              {t("admin_dashboard.projects_at_risk_title")}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin
                ? t("admin_dashboard.projects_at_risk_subtitle_org")
                : t("admin_dashboard.projects_at_risk_subtitle_user")}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              projectsAtRisk.length > 0
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-gray-50 text-gray-700 border border-gray-200"
            }`}
          >
            {projectsAtRisk.length === 1
              ? t("admin_dashboard.projects_count_one", { count: projectsAtRisk.length })
              : t("admin_dashboard.projects_count_other", { count: projectsAtRisk.length })}
          </span>
        </div>

        {projectsAtRisk.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4 text-center">{t("admin_dashboard.no_projects_at_risk")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th scope="col" className="py-2.5 pl-2 pr-4">
                    {t("admin_dashboard.th_code")}
                  </th>
                  <th scope="col" className="py-2.5 px-4">
                    {t("admin_dashboard.th_project_name")}
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-center">
                    {t("admin_dashboard.th_overdue_tasks")}
                  </th>
                  <th scope="col" className="py-2.5 pl-4 pr-2 text-right">
                    {t("admin_dashboard.th_action")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projectsAtRisk.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 pl-2 pr-4 font-mono font-medium text-gray-900">{p.code}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        {t("admin_dashboard.badge_overdue", { count: p.overdueCount })}
                      </span>
                    </td>
                    <td className="py-3 pl-4 pr-2 text-right">
                      <Link
                        to={`/projects/${p.id}`}
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {t("admin_dashboard.btn_view_project")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Personal Overdue Tasks Widget (FR-34) */}
      {overdue.length > 0 && (
        <section
          className="rounded-xl border border-red-200 bg-white p-6 shadow-xs space-y-4"
          data-testid="overdue-widget"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                {t("admin_dashboard.overdue_tasks_title")}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("admin_dashboard.overdue_tasks_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              {overdue.length === 1
                ? t("admin_dashboard.overdue_tasks_count_one", { count: overdue.length })
                : t("admin_dashboard.overdue_tasks_count_other", { count: overdue.length })}
            </span>
          </div>

          <div className="divide-y divide-gray-100 space-y-3">
            {overdue.map((task) => (
              <div
                key={task.id}
                className="pt-3 first:pt-0 flex items-start justify-between gap-3"
                data-testid="overdue-item"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/projects/${task.projectId}/tasks/${task.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {task.projectCode ? `${task.projectCode}-${task.number}: ` : ""}
                    {task.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="inline-flex items-center text-xs text-gray-500">{task.projectName}</span>
                    <span className="inline-flex items-center text-xs text-red-600 font-medium">
                      {t("admin_dashboard.due_date", { date: task.dueDate })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                    {task.daysOverdue === 1
                      ? t("admin_dashboard.days_overdue_one", { count: task.daysOverdue })
                      : t("admin_dashboard.days_overdue_other", { count: task.daysOverdue })}
                  </span>
                  {task.statusName && <span className="text-xs text-gray-500">{task.statusName}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid: Personal Today's Priorities and In Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Priorities Section */}
        <section
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col h-full"
          data-testid="admin-today-priorities-section"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.priorities_title")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("admin_dashboard.priorities_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              {todayPriorities.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {todayPriorities.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-4 text-center">{t("admin_dashboard.no_priorities")}</p>
            ) : (
              <div className="divide-y divide-gray-100 space-y-3">
                {todayPriorities.slice(0, 5).map((task) => (
                  <div key={task.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/projects/${task.projectId}/tasks/${task.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                      >
                        {task.projectCode ? `${task.projectCode}-${task.number}: ` : ""}
                        {task.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">{task.projectName}</span>
                        {task.isOverdue && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                            {t("admin_dashboard.badge_overdue_tag")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{task.statusName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Tasks in IN_PROGRESS */}
        <section
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col h-full"
          data-testid="admin-in-progress-section"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.in_progress_title")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("admin_dashboard.in_progress_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
              {inProgress.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {inProgress.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-4 text-center">{t("admin_dashboard.no_in_progress")}</p>
            ) : (
              <div className="divide-y divide-gray-100 space-y-3">
                {inProgress.slice(0, 5).map((task) => (
                  <div key={task.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/projects/${task.projectId}/tasks/${task.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                      >
                        {task.projectCode ? `${task.projectCode}-${task.number}: ` : ""}
                        {task.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">{task.projectName}</span>
                      </div>
                    </div>
                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded shrink-0">
                      {task.statusName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Navigation Shortcuts */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.card_projects_title")}</h2>
          <p className="text-sm text-gray-600">
            {isAdmin ? t("admin_dashboard.card_projects_desc_admin") : t("admin_dashboard.card_projects_desc_pm")}
          </p>
          <div className="pt-2">
            <Link
              to="/projects"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {t("admin_dashboard.btn_view_projects")}
            </Link>
          </div>
        </div>

        {isAdmin ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.card_users_title")}</h2>
              <p className="text-sm text-gray-600">{t("admin_dashboard.card_users_desc")}</p>
              <div className="pt-2">
                <Link
                  to="/admin/users"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {t("admin_dashboard.btn_manage_users")}
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.card_statuses_title")}</h2>
              <p className="text-sm text-gray-600">{t("admin_dashboard.card_statuses_desc")}</p>
              <div className="pt-2">
                <Link
                  to="/admin/statuses"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {t("admin_dashboard.btn_configure_statuses")}
                </Link>
              </div>
            </div>
          </>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{t("admin_dashboard.card_my_tasks_title")}</h2>
          <p className="text-sm text-gray-600">{t("admin_dashboard.card_my_tasks_desc")}</p>
          <div className="pt-2">
            <Link
              to="/my-tasks"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {t("admin_dashboard.btn_go_to_my_tasks")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
