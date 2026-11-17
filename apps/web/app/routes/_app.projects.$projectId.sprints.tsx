import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME, type SprintWithStatsDto } from "@pm/domain";

import { sprintsAction } from "../actions/sprintsAction";
import { sprintsLoader } from "../loaders/sprintsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Project Sprints — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return sprintsLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return sprintsAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
}

export default function ProjectSprintsPage() {
  const { sprints, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const [isCreating, setIsCreating] = useState(false);
  const [editingSprint, setEditingSprint] = useState<SprintWithStatsDto | null>(null);

  const isSubmitting = navigation.state === "submitting";
  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;

  const getStatusBadge = (status: "PLANNED" | "ACTIVE" | "COMPLETED") => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-50 text-green-700 ring-green-600/20";
      case "COMPLETED":
        return "bg-gray-100 text-gray-700 ring-gray-500/20";
      case "PLANNED":
      default:
        return "bg-blue-50 text-blue-700 ring-blue-600/20";
    }
  };

  return (
    <div className="space-y-6" data-testid="sprints-page">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sprints</h1>
          <p className="text-xs text-gray-500 mt-1">Manage project iteration cycles and track completion rates</p>
        </div>
        {permissions.canManageSprint ? (
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setEditingSprint(null);
            }}
            className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            data-testid="create-sprint-btn"
          >
            Create Sprint
          </button>
        ) : null}
      </div>

      {formError ? (
        <div className="rounded-md bg-red-50 p-4 border border-red-200" data-testid="sprints-error-alert">
          <p className="text-sm text-red-700">{formError}</p>
        </div>
      ) : null}

      {/* Create Sprint Modal / Form */}
      {isCreating && permissions.canManageSprint ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" data-testid="create-sprint-container">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Create New Sprint</h2>
          <Form
            method="post"
            className="space-y-4"
            data-testid="create-sprint-form"
            onSubmit={() => {
              setIsCreating(false);
            }}
          >
            <input type="hidden" name="intent" value="create" />

            <div>
              <label htmlFor="sprint-name" className="block text-xs font-medium text-gray-700 mb-1">
                Sprint Name
              </label>
              <input
                id="sprint-name"
                type="text"
                name="name"
                required
                maxLength={100}
                placeholder="Sprint 1"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="sprint-name-input"
              />
              {actionData?.errors?.name ? (
                <p className="text-xs text-red-600 mt-1">{actionData.errors.name.join(", ")}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sprint-startDate" className="block text-xs font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  id="sprint-startDate"
                  type="date"
                  name="startDate"
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="sprint-start-date-input"
                />
                {actionData?.errors?.startDate ? (
                  <p className="text-xs text-red-600 mt-1">{actionData.errors.startDate.join(", ")}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="sprint-endDate" className="block text-xs font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  id="sprint-endDate"
                  type="date"
                  name="endDate"
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="sprint-end-date-input"
                />
                {actionData?.errors?.endDate ? (
                  <p className="text-xs text-red-600 mt-1">{actionData.errors.endDate.join(", ")}</p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                data-testid="create-sprint-submit-btn"
              >
                {isSubmitting ? "Creating..." : "Save Sprint"}
              </button>
            </div>
          </Form>
        </div>
      ) : null}

      {/* Edit Sprint Form */}
      {editingSprint && permissions.canManageSprint ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" data-testid="edit-sprint-container">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Sprint: {editingSprint.name}</h2>
          <Form
            method="post"
            className="space-y-4"
            data-testid="edit-sprint-form"
            onSubmit={() => {
              setEditingSprint(null);
            }}
          >
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="sprintId" value={editingSprint.id} />

            <div>
              <label htmlFor="edit-name" className="block text-xs font-medium text-gray-700 mb-1">
                Sprint Name
              </label>
              <input
                id="edit-name"
                type="text"
                name="name"
                defaultValue={editingSprint.name}
                required
                maxLength={100}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="edit-sprint-name-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-startDate" className="block text-xs font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  id="edit-startDate"
                  type="date"
                  name="startDate"
                  defaultValue={editingSprint.startDate}
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="edit-sprint-start-date-input"
                />
              </div>

              <div>
                <label htmlFor="edit-endDate" className="block text-xs font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  id="edit-endDate"
                  type="date"
                  name="endDate"
                  defaultValue={editingSprint.endDate}
                  required
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="edit-sprint-end-date-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingSprint(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                data-testid="edit-sprint-submit-btn"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </Form>
        </div>
      ) : null}

      {/* Sprints List Table */}
      {sprints.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"
          data-testid="empty-sprints"
        >
          <p className="text-sm text-gray-500">No sprints created yet.</p>
          {permissions.canManageSprint ? (
            <button
              type="button"
              onClick={() => {
                setIsCreating(true);
              }}
              className="mt-3 inline-flex items-center rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Create your first sprint
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          data-testid="sprints-table-container"
        >
          <table className="min-w-full divide-y divide-gray-200" data-testid="sprints-table">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th scope="col" className="px-6 py-3">
                  Sprint Name
                </th>
                <th scope="col" className="px-6 py-3">
                  Status
                </th>
                <th scope="col" className="px-6 py-3">
                  Duration
                </th>
                <th scope="col" className="px-6 py-3">
                  Completion Rate
                </th>
                {permissions.canManageSprint ? (
                  <th scope="col" className="px-6 py-3 text-right">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              {sprints.map((sprint) => (
                <tr key={sprint.id} data-testid={`sprint-row-${sprint.id}`}>
                  <td className="px-6 py-4 font-medium text-gray-900" data-testid="sprint-name">
                    {sprint.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadge(
                        sprint.status,
                      )}`}
                      data-testid="sprint-status"
                    >
                      {sprint.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500" data-testid="sprint-dates">
                    {sprint.startDate} to {sprint.endDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap" data-testid="sprint-completion">
                    {sprint.completionRate === null ? (
                      <span className="text-gray-400">No tasks</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{sprint.completionRate}%</span>
                        <span className="text-xs text-gray-500">
                          ({sprint.completedCount}/{sprint.taskCount} done)
                        </span>
                      </div>
                    )}
                  </td>
                  {permissions.canManageSprint ? (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSprint(sprint);
                            setIsCreating(false);
                          }}
                          className="font-medium text-blue-600 hover:text-blue-500"
                          data-testid={`edit-sprint-btn-${sprint.id}`}
                        >
                          Edit
                        </button>
                        <Form method="post" className="inline" data-testid={`archive-sprint-form-${sprint.id}`}>
                          <input type="hidden" name="intent" value="archive" />
                          <input type="hidden" name="sprintId" value={sprint.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                            data-testid={`archive-sprint-btn-${sprint.id}`}
                          >
                            Archive
                          </button>
                        </Form>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
