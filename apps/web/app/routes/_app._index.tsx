import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { dashboardLoader } from "../loaders/dashboardLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Dashboard | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return dashboardLoader(ctx, request);
}

export default function MemberDashboardPage() {
  const { t } = useTranslation();
  const { user, inProgress, todayPriorities, overdue, unreadCount } = useLoaderData<typeof loader>();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8" data-testid="personal-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("dashboard.welcome", { name: user.fullName })}</p>
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
                  ? t("dashboard.unread_notifications", { count: unreadCount })
                  : t("dashboard.unread_notifications_plural", { count: unreadCount })}
              </span>
            </Link>
          ) : (
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <span>{t("dashboard.notifications_up_to_date")}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Overdue Tasks Widget (FR-34) */}
      {overdue.length > 0 && (
        <section
          className="rounded-xl border border-red-200 bg-white p-6 shadow-xs space-y-4"
          data-testid="overdue-widget"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                {t("dashboard.overdue_title")}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.overdue_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              {overdue.length === 1
                ? t("dashboard.overdue_count", { count: overdue.length })
                : t("dashboard.overdue_count_plural", { count: overdue.length })}
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
                      {t("dashboard.due_date", { date: task.dueDate })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                    {task.daysOverdue === 1
                      ? t("dashboard.days_overdue", { count: task.daysOverdue })
                      : t("dashboard.days_overdue_plural", { count: task.daysOverdue })}
                  </span>
                  {task.statusName && <span className="text-xs text-gray-500">{task.statusName}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid: Today's Priorities and In Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Priorities Section (P19) */}
        <section
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col h-full"
          data-testid="today-priorities-section"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("dashboard.today_priorities_title")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.today_priorities_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              {todayPriorities.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {todayPriorities.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-6 text-center">{t("dashboard.no_today_priorities")}</p>
            ) : (
              <div className="divide-y divide-gray-100 space-y-3">
                {todayPriorities.map((task) => (
                  <div key={task.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
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
                        {task.isOverdue && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                            {t("dashboard.badge_overdue")}
                          </span>
                        )}
                        {task.dueDate && !task.isOverdue && (
                          <span className="inline-flex items-center text-xs text-gray-500">
                            {t("dashboard.due_date", { date: task.dueDate })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          task.priority === "URGENT" || task.priority === "HIGH"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-gray-50 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-xs text-gray-500">{task.statusName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Tasks in IN_PROGRESS */}
        <section
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col h-full"
          data-testid="in-progress-section"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("dashboard.in_progress_title")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.in_progress_subtitle")}</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
              {inProgress.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {inProgress.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-6 text-center">{t("dashboard.no_in_progress")}</p>
            ) : (
              <div className="divide-y divide-gray-100 space-y-3">
                {inProgress.map((task) => (
                  <div key={task.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
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
                        {task.dueDate && (
                          <span
                            className={`inline-flex items-center text-xs ${task.isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}
                          >
                            {task.isOverdue
                              ? t("dashboard.due_with_overdue", { date: task.dueDate })
                              : t("dashboard.due_date", { date: task.dueDate })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {task.statusName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{t("dashboard.my_tasks_card_title")}</h2>
          <p className="text-sm text-gray-600">{t("dashboard.my_tasks_card_desc")}</p>
          <div className="pt-2">
            <Link
              to="/my-tasks"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              {t("dashboard.my_tasks_card_link")}
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{t("dashboard.my_projects_card_title")}</h2>
          <p className="text-sm text-gray-600">{t("dashboard.my_projects_card_desc")}</p>
          <div className="pt-2">
            <Link
              to="/projects"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              {t("dashboard.my_projects_card_link")}
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{t("dashboard.calendar_card_title")}</h2>
          <p className="text-sm text-gray-600">{t("dashboard.calendar_card_desc")}</p>
          <div className="pt-2">
            <Link
              to="/calendar"
              className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              {t("dashboard.calendar_card_link")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
