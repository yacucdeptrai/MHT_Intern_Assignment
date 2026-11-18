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
  const { user, projectsAtRisk, inProgress, todayPriorities, unreadCount } = useLoaderData<typeof loader>();
  const isAdmin = user.systemRole === "ADMIN";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8" data-testid="admin-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back, {user.fullName}. You are signed in as an organization {user.systemRole}.
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
                {unreadCount} unread {unreadCount === 1 ? "notification" : "notifications"}
              </span>
            </Link>
          ) : (
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <span>Notifications up to date</span>
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
              Projects at Risk
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Active projects with overdue tasks requiring attention ({isAdmin ? "Organization-wide" : "Your projects"})
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              projectsAtRisk.length > 0
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-gray-50 text-gray-700 border border-gray-200"
            }`}
          >
            {projectsAtRisk.length} {projectsAtRisk.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {projectsAtRisk.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4 text-center">No projects currently at risk.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th scope="col" className="py-2.5 pl-2 pr-4">
                    Code
                  </th>
                  <th scope="col" className="py-2.5 px-4">
                    Project Name
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-center">
                    Overdue Tasks
                  </th>
                  <th scope="col" className="py-2.5 pl-4 pr-2 text-right">
                    Action
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
                        {p.overdueCount} overdue
                      </span>
                    </td>
                    <td className="py-3 pl-4 pr-2 text-right">
                      <Link
                        to={`/projects/${p.id}`}
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        View Project →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Grid: Personal Today's Priorities and In Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Priorities Section */}
        <section
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col h-full"
          data-testid="admin-today-priorities-section"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Your Priorities Today</h2>
              <p className="text-xs text-gray-500 mt-0.5">Assigned overdue, due today, or high/urgent tasks</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              {todayPriorities.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {todayPriorities.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-4 text-center">No priority tasks for today.</p>
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
                            Overdue
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
              <h2 className="text-base font-semibold text-gray-900">Your In-Progress Tasks</h2>
              <p className="text-xs text-gray-500 mt-0.5">Tasks currently in active progress</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
              {inProgress.length}
            </span>
          </div>

          <div className="pt-4 flex-1">
            {inProgress.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-4 text-center">No tasks currently in progress.</p>
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
          <h2 className="text-base font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-600">
            {isAdmin ? "Oversee, configure, and monitor all organization projects." : "Manage projects you coordinate."}
          </p>
          <div className="pt-2">
            <Link
              to="/projects"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              View Projects →
            </Link>
          </div>
        </div>

        {isAdmin ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">User Management</h2>
              <p className="text-sm text-gray-600">
                Invite new team members, manage account status, and assign system permissions.
              </p>
              <div className="pt-2">
                <Link
                  to="/admin/users"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Manage Users →
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Task Statuses</h2>
              <p className="text-sm text-gray-600">Configure system-wide workflow statuses and category defaults.</p>
              <div className="pt-2">
                <Link
                  to="/admin/statuses"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Configure Statuses →
                </Link>
              </div>
            </div>
          </>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-gray-900">My Tasks</h2>
          <p className="text-sm text-gray-600">Track tasks assigned to you or waiting for your review.</p>
          <div className="pt-2">
            <Link
              to="/my-tasks"
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Go to My Tasks →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
