import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME, TASK_PRIORITIES, type TaskDetailLoaderData, type TaskPriority } from "@pm/domain";

import { taskDetailAction } from "../actions/taskDetailAction";
import { taskDetailLoader } from "../loaders/taskDetailLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta({ data }: { data?: TaskDetailLoaderData }) {
  if (!data?.task) {
    return [{ title: `Task Detail — ${APP_NAME}` }];
  }
  return [{ title: `${data.task.projectCode}-${data.task.number}: ${data.task.title} — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  const taskId = params.taskId ?? "";
  return taskDetailLoader(ctx, projectId, taskId, request);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  const taskId = params.taskId ?? "";
  return taskDetailAction(ctx, projectId, taskId, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function TaskDetailPage() {
  const { task, subTasks, sprints, members, statuses, permissions } = useLoaderData<TaskDetailLoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const [isEditing, setIsEditing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [reasonFormMode, setReasonFormMode] = useState<"reject" | "reopen" | null>(null);
  const [prevActionData, setPrevActionData] = useState(actionData);

  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsEditing(false);
      setIsAssigning(false);
      setIsAddingSubtask(false);
      setReasonFormMode(null);
    }
  }

  const isSubmitting = navigation.state === "submitting";
  const isConflict =
    actionData?.message?.includes("someone else") || actionData?.message?.includes("Reload to see the latest version");

  const priorityColor: Record<TaskPriority, string> = {
    LOW: "bg-gray-100 text-gray-700",
    MEDIUM: "bg-blue-100 text-blue-700",
    HIGH: "bg-amber-100 text-amber-700",
    URGENT: "bg-red-100 text-red-700",
  };

  const statusCategoryColor: Record<string, string> = {
    TODO: "bg-gray-100 text-gray-800 border-gray-300",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
    REVIEW: "bg-purple-50 text-purple-700 border-purple-200",
    DONE: "bg-green-50 text-green-700 border-green-200",
  };

  return (
    <div className="space-y-6" data-testid="task-detail-page">
      {/* Breadcrumb navigation */}
      <nav className="flex items-center gap-2 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/projects" className="hover:text-gray-700">
          Projects
        </Link>
        <span>/</span>
        <Link to={`/projects/${task.projectId}`} className="hover:text-gray-700">
          {task.projectCode} Tasks
        </Link>
        <span>/</span>
        <span className="font-semibold text-gray-900" data-testid="task-breadcrumb-number">
          {task.projectCode}-{task.number}
        </span>
      </nav>

      {/* Conflict banner */}
      {isConflict ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm flex items-center justify-between"
          data-testid="conflict-banner"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold">Version Conflict</p>
              <p className="text-sm">This task was changed by someone else. Reload to see the latest version.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
            data-testid="reload-version-button"
          >
            Reload
          </button>
        </div>
      ) : null}

      {/* General error banner */}
      {actionData?.message && !isConflict && !actionData.success ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm"
          data-testid="action-error"
        >
          {actionData.message}
        </div>
      ) : null}

      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-800"
              data-testid="task-key"
            >
              {task.projectCode}-{task.number}
            </span>
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${
                statusCategoryColor[task.statusCategory] ?? "bg-gray-100 text-gray-800 border-gray-300"
              }`}
              data-testid="task-status-badge"
            >
              {task.statusName}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${priorityColor[task.priority]}`}
              data-testid="task-priority-badge"
            >
              {task.priority}
            </span>
            {task.isOverdue ? (
              <span
                className="inline-flex items-center rounded-md bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white"
                data-testid="overdue-badge"
              >
                Overdue
              </span>
            ) : null}
            {task.isDueSoon && !task.isOverdue ? (
              <span
                className="inline-flex items-center rounded-md bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white"
                data-testid="due-soon-badge"
              >
                Due Soon
              </span>
            ) : null}
            {task.isTodayPriority ? (
              <span
                className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white"
                data-testid="today-priority-badge"
              >
                Today Priority
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="task-title">
            {task.title}
          </h1>
          {task.parentTaskId ? (
            <p className="text-sm text-gray-500">
              Sub-task of{" "}
              <Link
                to={`/projects/${task.projectId}/tasks/${task.parentTaskId}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {task.projectCode}-{task.parentTaskNumber}: {task.parentTaskTitle}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {permissions.canApprove ? (
            <>
              <Form method="post">
                <input type="hidden" name="intent" value="approve" />
                <input type="hidden" name="version" value={task.version} />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
                  data-testid="approve-task-button"
                >
                  Approve Task
                </button>
              </Form>
              <button
                type="button"
                onClick={() => {
                  setReasonFormMode(reasonFormMode === "reject" ? null : "reject");
                }}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100"
                data-testid="reject-task-button"
              >
                Reject Task
              </button>
            </>
          ) : null}

          {permissions.canReopen ? (
            <button
              type="button"
              onClick={() => {
                setReasonFormMode(reasonFormMode === "reopen" ? null : "reopen");
              }}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 shadow-sm hover:bg-indigo-100"
              data-testid="reopen-task-button"
            >
              Reopen Task
            </button>
          ) : null}

          {task.statusCategory === "DONE" ? (
            <span
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
              data-testid="frozen-done-indicator"
            >
              Completed (Reopen to edit)
            </span>
          ) : permissions.canEdit && !isEditing ? (
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              data-testid="edit-task-button"
            >
              Edit Task
            </button>
          ) : null}

          {permissions.canArchive ? (
            <Form
              method="post"
              onSubmit={(e) => {
                if (!confirm("Are you sure you want to archive this task?")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="archive" />
              <input type="hidden" name="version" value={task.version} />
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
                data-testid="archive-task-button"
              >
                Archive Task
              </button>
            </Form>
          ) : null}
        </div>
      </div>

      {/* Reject / Reopen Reason Form */}
      {reasonFormMode ? (
        <div
          className="rounded-xl border border-amber-200 bg-white p-6 shadow-sm space-y-4"
          data-testid="form-reason-transition"
        >
          <h2 className="text-base font-bold text-gray-900">
            {reasonFormMode === "reject" ? "Reject Task" : "Reopen Task"}
          </h2>
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value={reasonFormMode} />
            <input type="hidden" name="version" value={task.version} />
            <div>
              <label htmlFor="task-reason-input" className="block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="task-reason-input"
                name="reason"
                rows={3}
                maxLength={2000}
                defaultValue={actionData?.values?.reason ?? ""}
                placeholder={
                  reasonFormMode === "reject"
                    ? "Explain what needs to be reworked..."
                    : "Explain why this completed task is being reopened..."
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                data-testid="input-task-reason"
              />
              {actionData?.errors?.reason ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-reason">
                  {actionData.errors.reason.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setReasonFormMode(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                data-testid="cancel-reason-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                data-testid="submit-reason-button"
              >
                {reasonFormMode === "reject" ? "Confirm Reject" : "Confirm Reopen"}
              </button>
            </div>
          </Form>
        </div>
      ) : null}

      {/* Main Grid: Form/Details & Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Content or Edit Form */}
        <div className="space-y-6 lg:col-span-2">
          {isEditing ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" data-testid="edit-task-form">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Edit Task</h2>
              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="version" value={task.version} data-testid="input-task-version" />

                <div>
                  <label htmlFor="task-title-input" className="block text-sm font-medium text-gray-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="task-title-input"
                    type="text"
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={actionData?.values?.title ?? task.title}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                    data-testid="edit-title-input"
                  />
                  {actionData?.errors?.title ? (
                    <p className="mt-1 text-xs text-red-600" data-testid="error-title">
                      {actionData.errors.title.join(", ")}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="task-desc-input" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="task-desc-input"
                    name="description"
                    rows={5}
                    maxLength={10000}
                    defaultValue={actionData?.values?.description ?? task.description ?? ""}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                    data-testid="edit-description-input"
                  />
                  {actionData?.errors?.description ? (
                    <p className="mt-1 text-xs text-red-600" data-testid="error-description">
                      {actionData.errors.description.join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="task-priority-select" className="block text-sm font-medium text-gray-700">
                      Priority
                    </label>
                    <select
                      id="task-priority-select"
                      name="priority"
                      defaultValue={actionData?.values?.priority ?? task.priority}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                      data-testid="edit-priority-select"
                    >
                      {TASK_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!task.parentTaskId ? (
                    <div>
                      <label htmlFor="task-sprint-select" className="block text-sm font-medium text-gray-700">
                        Sprint
                      </label>
                      <select
                        id="task-sprint-select"
                        name="sprintId"
                        defaultValue={actionData?.values?.sprintId ?? task.sprintId ?? ""}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                        data-testid="edit-sprint-select"
                      >
                        <option value="">Backlog (No Sprint)</option>
                        {sprints.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {actionData?.errors?.sprintId ? (
                        <p className="mt-1 text-xs text-red-600" data-testid="error-sprintId">
                          {actionData.errors.sprintId.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="task-start-date" className="block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      id="task-start-date"
                      type="date"
                      name="startDate"
                      defaultValue={actionData?.values?.startDate ?? task.startDate ?? ""}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                      data-testid="edit-start-date-input"
                    />
                    {actionData?.errors?.startDate ? (
                      <p className="mt-1 text-xs text-red-600" data-testid="error-startDate">
                        {actionData.errors.startDate.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="task-due-date" className="block text-sm font-medium text-gray-700">
                      Due Date
                    </label>
                    <input
                      id="task-due-date"
                      type="date"
                      name="dueDate"
                      defaultValue={actionData?.values?.dueDate ?? task.dueDate ?? ""}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                      data-testid="edit-due-date-input"
                    />
                    {actionData?.errors?.dueDate ? (
                      <p className="mt-1 text-xs text-red-600" data-testid="error-dueDate">
                        {actionData.errors.dueDate.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    data-testid="cancel-edit-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    data-testid="save-task-button"
                  >
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </Form>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Description</h2>
              <div
                className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed min-h-[4rem]"
                data-testid="task-description"
              >
                {task.description ? (
                  task.description
                ) : (
                  <span className="italic text-gray-400">No description provided.</span>
                )}
              </div>
            </div>
          )}

          {/* Subtasks Section */}
          {(() => {
            const doneSubtasksCount = subTasks.filter((st) => st.statusCategory === "DONE").length;
            const totalSubtasksCount = subTasks.length;

            return (
              <div
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
                data-testid="subtasks-section"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-bold text-gray-900">Sub-tasks ({subTasks.length})</h2>
                    {totalSubtasksCount > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(doneSubtasksCount / totalSubtasksCount) * 100}%` }}
                          />
                        </div>
                        <span
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700"
                          data-testid="subtask-progress"
                        >
                          {doneSubtasksCount} / {totalSubtasksCount} done
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {!task.parentTaskId && !isAddingSubtask ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSubtask(true);
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                      data-testid="add-subtask-button"
                    >
                      + Add Sub-task
                    </button>
                  ) : null}
                </div>

                {isAddingSubtask ? (
                  <Form
                    method="post"
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
                    data-testid="form-add-subtask"
                  >
                    <input type="hidden" name="intent" value="addSubTask" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Add Sub-task</h3>
                    <div>
                      <input
                        type="text"
                        name="title"
                        required
                        maxLength={200}
                        placeholder="Sub-task title"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                        data-testid="input-subtask-title"
                      />
                      {actionData?.errors?.title ? (
                        <p className="mt-1 text-xs text-red-600">{actionData.errors.title.join(", ")}</p>
                      ) : null}
                    </div>
                    <div>
                      <textarea
                        name="description"
                        rows={2}
                        maxLength={10000}
                        placeholder="Description (optional)"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                        data-testid="input-subtask-description"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="subtask-priority-select" className="block text-xs font-medium text-gray-700">
                          Priority
                        </label>
                        <select
                          id="subtask-priority-select"
                          name="priority"
                          defaultValue="MEDIUM"
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                          data-testid="select-subtask-priority"
                        >
                          {TASK_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="subtask-start-date-input" className="block text-xs font-medium text-gray-700">
                          Start Date
                        </label>
                        <input
                          id="subtask-start-date-input"
                          type="date"
                          name="startDate"
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                          data-testid="input-subtask-start-date"
                        />
                      </div>
                      <div>
                        <label htmlFor="subtask-due-date-input" className="block text-xs font-medium text-gray-700">
                          Due Date
                        </label>
                        <input
                          id="subtask-due-date-input"
                          type="date"
                          name="dueDate"
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                          data-testid="input-subtask-due-date"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingSubtask(false);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        data-testid="btn-cancel-subtask"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        data-testid="btn-create-subtask"
                      >
                        Create Sub-task
                      </button>
                    </div>
                  </Form>
                ) : null}

                {subTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No sub-tasks</p>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {subTasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50"
                        data-testid="subtask-row"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-medium text-gray-500">
                            {task.projectCode}-{st.number}
                          </span>
                          <Link
                            to={`/projects/${st.projectId}/tasks/${st.id}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                            data-testid="subtask-link"
                          >
                            {st.title}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${priorityColor[st.priority]}`}>
                            {st.priority}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{st.statusName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TODO(M5-T1): render threaded comments (including rejection and reopen reason comments) */}
        </div>

        {/* Right 1 Col: Metadata Sidebar */}
        <div className="space-y-6">
          <div
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
            data-testid="task-sidebar"
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Details</h2>

            <div>
              <p className="text-xs font-medium text-gray-500">Status</p>
              <p className="mt-1 text-sm font-semibold text-gray-900" data-testid="sidebar-status">
                {task.statusName}
              </p>
              {permissions.canEdit ? (
                <Form method="post" className="mt-2 flex items-center gap-2" data-testid="form-change-status">
                  <input type="hidden" name="intent" value="changeStatus" />
                  <input type="hidden" name="version" value={task.version} data-testid="status-form-version" />
                  <label htmlFor="task-status-select" className="sr-only">
                    Change Status
                  </label>
                  <select
                    id="task-status-select"
                    name="statusId"
                    key={task.statusId}
                    defaultValue={task.statusId}
                    className="block w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                    data-testid="select-task-status"
                  >
                    {statuses
                      .filter((s) => s.canSelect)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    data-testid="btn-change-status"
                  >
                    Move
                  </button>
                </Form>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Priority</p>
              <p className="mt-1 text-sm font-semibold text-gray-900" data-testid="sidebar-priority">
                {task.priority}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500">Sprint</p>
              <p className="mt-1 text-sm text-gray-900" data-testid="sidebar-sprint">
                {task.sprintName ? task.sprintName : <span className="text-gray-400">Backlog</span>}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Assignees</p>
                {permissions.canAssign && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAssigning(!isAssigning);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    data-testid="btn-toggle-assign"
                  >
                    {isAssigning ? "Cancel" : "Change"}
                  </button>
                )}
              </div>
              {isAssigning ? (
                <Form method="post" className="mt-2 space-y-2" data-testid="form-assign">
                  <input type="hidden" name="intent" value="assign" />
                  <input type="hidden" name="version" value={task.version} />
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-gray-200 p-2">
                    {members.map((m) => {
                      const isAssigned = task.assignees.some((a) => a.id === m.id);
                      return (
                        <label key={m.id} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            name="assigneeIds"
                            value={m.id}
                            defaultChecked={isAssigned}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            data-testid={`checkbox-assignee-${m.id}`}
                          />
                          <span>{m.fullName}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      data-testid="btn-save-assign"
                    >
                      Save
                    </button>
                  </div>
                </Form>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2" data-testid="sidebar-assignees">
                  {task.assignees.length === 0 ? (
                    <span className="text-sm text-gray-400">Unassigned</span>
                  ) : (
                    task.assignees.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                        data-testid={`assignee-pill-${a.id}`}
                      >
                        {a.fullName}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <p className="text-xs font-medium text-gray-500">Start Date</p>
                <p className="mt-1 text-sm text-gray-900" data-testid="sidebar-start-date">
                  {task.startDate ? task.startDate : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Due Date</p>
                <p className="mt-1 text-sm text-gray-900" data-testid="sidebar-due-date">
                  {task.dueDate ? task.dueDate : "—"}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2 text-xs text-gray-500">
              <p>
                Created by <span className="font-medium text-gray-700">{task.creatorName}</span>
              </p>
              <p>
                Version{" "}
                <span className="font-mono font-medium text-gray-700" data-testid="display-task-version">
                  {task.version}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
