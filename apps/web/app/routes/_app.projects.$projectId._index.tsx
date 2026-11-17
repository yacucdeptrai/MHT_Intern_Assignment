import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteLoaderData } from "react-router";

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
  const { tasks, members, statuses, canCreate, canAssign } = useLoaderData<ProjectTasksLoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  const isOpen = isModalOpen && !actionData?.success;
  const statusMap = new Map(statuses.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Project Tasks</h2>
          <p className="mt-1 text-sm text-gray-500">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} in this project
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

      {/* Task list */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {tasks.length === 0 ? (
          <div className="p-12 text-center" data-testid="empty-tasks">
            <h3 className="text-base font-medium text-gray-900">No tasks yet</h3>
            <p className="mt-1 text-sm text-gray-500">Create the first task for this project to get started.</p>
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
              {tasks.map((task) => {
                const projectCode = headerData?.project.code ?? "TASK";
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
                        {statusMap.get(task.statusId) ?? "Unknown"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{task.dueDate ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
                {actionData?.errors?.startDate ? (
                  <p className="mt-1 text-xs text-red-600">{actionData.errors.startDate.join(", ")}</p>
                ) : null}
              </div>

              {canAssign && members.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Assignees</label>
                  <div
                    className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-2"
                    data-testid="task-assignees-container"
                  >
                    {members.map((m) => (
                      <label key={m.userId} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          name="assigneeIds"
                          value={m.userId}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          data-testid={`assignee-checkbox-${m.userId}`}
                        />
                        <span>{m.fullName}</span>
                        <span className="text-xs text-gray-400">({m.projectRole})</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
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
