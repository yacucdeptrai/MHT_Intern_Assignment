import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import { APP_NAME, TASK_PRIORITIES, type TaskPriority } from "@pm/domain";

import { projectTasksAction } from "../actions/projectTasksAction";
import type { ProjectHeaderLoaderData } from "../loaders/projectHeaderLoader";
import { projectTasksLoader, type ProjectTasksLoaderData } from "../loaders/projectTasksLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Tasks — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksLoader(ctx, projectId, request);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksAction(ctx, projectId, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function ProjectIndexPage() {
  const headerData = useRouteLoaderData<ProjectHeaderLoaderData>("routes/_app.projects.$projectId");
  const { tasks, members, statuses, sprints, filters, canCreate, canAssign } = useLoaderData<ProjectTasksLoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prevActionData, setPrevActionData] = useState(actionData);

  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsModalOpen(false);
    }
  }

  const isSubmitting = navigation.state === "submitting";
  const isOpen = isModalOpen;
  const projectCode = headerData?.project.code ?? "TASK";

  function makePageUrl(newPage: number): string {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(newPage));
    return `?${next.toString()}`;
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Project Tasks</h2>
          <p className="mt-1 text-sm text-gray-500">
            {tasks.total} {tasks.total === 1 ? "task" : "tasks"} in this project
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate ? (
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              data-testid="create-task-button"
            >
              + New Task
            </button>
          ) : null}
        </div>
      </div>

      {actionData?.message && !actionData.success ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="action-error">
          {actionData.message}
        </div>
      ) : null}

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="project-tasks-filters">
        <Form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 items-end">
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
            <label htmlFor="filter-assignee" className="block text-xs font-medium text-gray-700">
              Assignee
            </label>
            <select
              id="filter-assignee"
              name="assigneeId"
              defaultValue={filters.assigneeId ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-assignee-select"
            >
              <option value="">All Assignees</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
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
            <label htmlFor="filter-sprint" className="block text-xs font-medium text-gray-700">
              Sprint
            </label>
            <select
              id="filter-sprint"
              name="sprintId"
              defaultValue={filters.sprintId ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="filter-sprint-select"
            >
              <option value="">All Sprints</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
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
              to=""
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
              data-testid="reset-filters-link"
            >
              Reset
            </Link>
          </div>
        </Form>
      </div>

      {/* Task list */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {tasks.items.length === 0 ? (
          <div className="p-12 text-center" data-testid="empty-tasks">
            <h3 className="text-base font-medium text-gray-900">No tasks yet</h3>
            <p className="mt-1 text-sm text-gray-500">No tasks match your criteria in this project.</p>
            {canCreate ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(true);
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  + Create Task
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200" data-testid="tasks-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tasks.items.map((task) => {
                return (
                  <tr key={task.id} className="hover:bg-gray-50" data-testid={`task-row-${task.id}`}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-blue-600">
                      {projectCode}-{task.number}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <Link
                        to={`/projects/${task.projectId}/tasks/${task.id}`}
                        className="hover:underline"
                        data-testid={`task-link-${task.id}`}
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          task.priority === "URGENT"
                            ? "bg-red-100 text-red-800"
                            : task.priority === "HIGH"
                              ? "bg-orange-100 text-orange-800"
                              : task.priority === "MEDIUM"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        {task.statusName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <span>{task.dueDate ?? "—"}</span>
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
                );
              })}
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

      {/* Create Task Modal */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-semibold text-gray-900">Create New Task</h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="createTask" />

              <div>
                <label htmlFor="task-title" className="block text-sm font-medium text-gray-700">
                  Task Title *
                </label>
                <input
                  id="task-title"
                  type="text"
                  name="title"
                  required
                  defaultValue={actionData?.values?.title ?? ""}
                  placeholder="Short, descriptive title"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="task-title-input"
                />
                {actionData?.errors?.title ? (
                  <p className="mt-1 text-xs text-red-600">{actionData.errors.title.join(", ")}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="task-desc" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="task-desc"
                  name="description"
                  rows={3}
                  defaultValue={actionData?.values?.description ?? ""}
                  placeholder="Task details and expectations"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="task-description-input"
                />
                {actionData?.errors?.description ? (
                  <p className="mt-1 text-xs text-red-600">{actionData.errors.description.join(", ")}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700">
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    name="priority"
                    defaultValue={actionData?.values?.priority ?? "MEDIUM"}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="task-priority-select"
                  >
                    {TASK_PRIORITIES.map((p: TaskPriority) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-due" className="block text-sm font-medium text-gray-700">
                    Due Date
                  </label>
                  <input
                    id="task-due"
                    type="date"
                    name="dueDate"
                    defaultValue={actionData?.values?.dueDate ?? ""}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="task-due-date-input"
                  />
                  {actionData?.errors?.dueDate ? (
                    <p className="mt-1 text-xs text-red-600">{actionData.errors.dueDate.join(", ")}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label htmlFor="task-start" className="block text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  id="task-start"
                  type="date"
                  name="startDate"
                  defaultValue={actionData?.values?.startDate ?? ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="task-start-date-input"
                />
              </div>

              {canAssign && members.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Assignees</label>
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1 rounded-lg border border-gray-200 p-2">
                    {members.map((member) => (
                      <label key={member.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="assigneeIds"
                          value={member.id}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          {member.fullName} ({member.email})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  data-testid="task-submit-button"
                >
                  {isSubmitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
