import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";

import { APP_NAME, TASK_PRIORITIES, type TaskPriority } from "@pm/domain";

import { myTasksLoader } from "../loaders/myTasksLoader";
import type { MyTasksLoaderData } from "@pm/domain";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `My Tasks — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return myTasksLoader(ctx, request);
}

export default function MyTasksPage() {
  const { tasks, filters, projects, statuses } = useLoaderData<MyTasksLoaderData>();
  const [searchParams] = useSearchParams();

  function makePageUrl(newPage: number): string {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(newPage));
    return `?${next.toString()}`;
  }

  return (
    <div className="space-y-6" data-testid="my-tasks-container">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tasks assigned to you across your accessible projects ({tasks.total} total).
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="my-tasks-filter-bar">
        <Form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 items-end">
          <div>
            <label htmlFor="filter-project" className="block text-xs font-medium text-gray-700">
              Project
            </label>
            <select
              id="filter-project"
              name="projectId"
              defaultValue={filters.projectId ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-project-select"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" className="block text-xs font-medium text-gray-700">
              Status
            </label>
            <select
              id="filter-status"
              name="statusId"
              defaultValue={filters.statusId ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-status-select"
            >
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-priority" className="block text-xs font-medium text-gray-700">
              Priority
            </label>
            <select
              id="filter-priority"
              name="priority"
              defaultValue={filters.priority ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-priority-select"
            >
              <option value="">All Priorities</option>
              {TASK_PRIORITIES.map((p: TaskPriority) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-due-range" className="block text-xs font-medium text-gray-700">
              Due Date
            </label>
            <select
              id="filter-due-range"
              name="dueRange"
              defaultValue={filters.dueRange ?? "all"}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-due-range-select"
            >
              <option value="all">All Dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due Today</option>
              <option value="week">Due This Week</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm"
              data-testid="apply-filters-button"
            >
              Apply
            </button>
            <Link
              to="/my-tasks"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
              data-testid="reset-filters-link"
            >
              Reset
            </Link>
          </div>
        </Form>
      </div>

      {/* Task Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {tasks.items.length === 0 ? (
          <div className="p-12 text-center" data-testid="empty-my-tasks">
            <h3 className="text-base font-semibold text-gray-900">No tasks found</h3>
            <p className="mt-1 text-sm text-gray-500">You have no tasks matching the selected filters.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm" data-testid="my-tasks-table">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-3">Task</th>
                <th className="px-6 py-3">Project</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tasks.items.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors" data-testid={`my-task-row-${task.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-gray-500">
                        {task.projectCode ? `${task.projectCode}-${task.number}` : `#${task.number}`}
                      </span>
                      <Link
                        to={`/projects/${task.projectId}/tasks/${task.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {task.title}
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{task.projectName ?? "—"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        task.priority === "URGENT"
                          ? "bg-red-100 text-red-800"
                          : task.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800"
                            : task.priority === "MEDIUM"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                      {task.statusName}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{task.dueDate ?? "—"}</span>
                      {task.isOverdue ? (
                        <span className="inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          OVERDUE
                        </span>
                      ) : task.isDueSoon ? (
                        <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          DUE SOON
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {tasks.totalPages > 1 ? (
          <div
            className="flex items-center justify-between border-t border-gray-200 px-6 py-3"
            data-testid="pagination-bar"
          >
            <div className="text-sm text-gray-500">
              Showing {(tasks.page - 1) * tasks.pageSize + 1} to {Math.min(tasks.page * tasks.pageSize, tasks.total)} of{" "}
              {tasks.total} tasks
            </div>
            <div className="flex items-center gap-2">
              {tasks.page > 1 ? (
                <Link
                  to={makePageUrl(tasks.page - 1)}
                  className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  data-testid="prev-page-button"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-400 cursor-not-allowed">
                  Previous
                </span>
              )}
              <span className="text-sm font-medium text-gray-700" data-testid="page-indicator">
                Page {tasks.page} of {tasks.totalPages}
              </span>
              {tasks.page < tasks.totalPages ? (
                <Link
                  to={makePageUrl(tasks.page + 1)}
                  className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  data-testid="next-page-button"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-400 cursor-not-allowed">
                  Next
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
