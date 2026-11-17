import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectSettingsAction } from "../actions/projectSettingsAction";
import { projectSettingsLoader } from "../loaders/projectSettingsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Project Settings — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectSettingsLoader(ctx, request, projectId);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectSettingsAction(ctx, request, projectId);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function ProjectSettingsPage() {
  const { project, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const nameError = actionData?.errors?.name?.[0];
  const descriptionError = actionData?.errors?.description?.[0];
  const budgetError = actionData?.errors?.budget?.[0];
  const startDateError = actionData?.errors?.startDate?.[0];
  const endDateError = actionData?.errors?.endDate?.[0];
  const statusError = actionData?.errors?.status?.[0];
  const slackChannelError = actionData?.errors?.slackChannelId?.[0];

  const values = actionData?.values ?? {};

  return (
    <div className="space-y-8" data-testid="project-settings-page">
      {/* Global Banners */}
      {project.isArchived ? (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 border border-amber-200">
          This project is archived and read-only. Settings cannot be modified.
        </div>
      ) : null}

      {actionData?.success ? (
        <div
          className="rounded-lg bg-green-50 p-4 text-sm text-green-700 border border-green-200"
          data-testid="success-banner"
        >
          Project settings updated successfully.
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200" data-testid="form-error">
          {formError}
        </div>
      ) : null}

      {/* Main Settings Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">General Settings</h2>
        <Form method="post" className="space-y-6" data-testid="update-project-form">
          <input type="hidden" name="intent" value="update" />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Project Code (Read-only, immutable per FR-08 c2) */}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Project Code
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="code"
                  name="code"
                  disabled
                  value={project.code}
                  data-testid="input-code"
                  className="block w-full uppercase font-mono rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Project code cannot be changed once created.</p>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Project Status <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <select
                  id="status"
                  name="status"
                  disabled={project.isArchived}
                  defaultValue={values.status ?? project.status}
                  data-testid="select-status"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    statusError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>
              {statusError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-status">
                  {statusError}
                </p>
              ) : null}
            </div>

            {/* Name */}
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Project Name <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  disabled={project.isArchived}
                  defaultValue={values.name ?? project.name}
                  placeholder="e.g. Next-Gen Mobile Banking"
                  data-testid="input-name"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    nameError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {nameError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-name">
                  {nameError}
                </p>
              ) : null}
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <div className="mt-1">
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  disabled={project.isArchived}
                  defaultValue={values.description ?? project.description ?? ""}
                  placeholder="Brief summary of project scope, objectives, and deliverables."
                  data-testid="input-description"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    descriptionError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {descriptionError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-description">
                  {descriptionError}
                </p>
              ) : null}
            </div>

            {/* Budget */}
            <div>
              <label htmlFor="budget" className="block text-sm font-medium text-gray-700">
                Budget (VND)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="budget"
                  name="budget"
                  min="0"
                  step="1"
                  disabled={project.isArchived}
                  defaultValue={values.budget ?? (project.budget !== null ? String(project.budget) : "")}
                  placeholder="e.g. 50000000"
                  data-testid="input-budget"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    budgetError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {budgetError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-budget">
                  {budgetError}
                </p>
              ) : null}
            </div>

            {/* Slack Channel */}
            <div>
              <label htmlFor="slackChannelId" className="block text-sm font-medium text-gray-700">
                Slack Channel ID
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="slackChannelId"
                  name="slackChannelId"
                  disabled={project.isArchived}
                  defaultValue={values.slackChannelId ?? project.slackChannelId ?? ""}
                  placeholder="e.g. C0123456789"
                  data-testid="input-slack-channel"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    slackChannelError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {slackChannelError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-slack-channel">
                  {slackChannelError}
                </p>
              ) : null}
            </div>

            {/* Timeline: Start Date */}
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  required
                  disabled={project.isArchived}
                  defaultValue={values.startDate ?? project.startDate}
                  data-testid="input-start-date"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    startDateError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {startDateError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-start-date">
                  {startDateError}
                </p>
              ) : null}
            </div>

            {/* Timeline: End Date */}
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  required
                  disabled={project.isArchived}
                  defaultValue={values.endDate ?? project.endDate}
                  data-testid="input-end-date"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                    endDateError
                      ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                />
              </div>
              {endDateError ? (
                <p className="mt-1 text-xs text-red-600" data-testid="error-end-date">
                  {endDateError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting || project.isArchived}
              data-testid="save-settings-button"
              className="inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </Form>
      </div>

      {/* Danger Zone */}
      {permissions.canManageProject && !project.isArchived ? (
        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm" data-testid="danger-zone">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-6">
            Archiving a project soft deletes it and makes all tasks and settings read-only. Members will no longer see
            this project in their workspace. Only System Administrators can access archived projects.
          </p>
          <Form
            method="post"
            data-testid="archive-project-form"
            onSubmit={(e) => {
              if (
                !confirm(
                  "Are you sure you want to archive this project? It will become read-only and hidden from members.",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="archive" />
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="archive-project-button"
              className="inline-flex justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Archiving..." : "Archive Project"}
            </button>
          </Form>
        </div>
      ) : null}
    </div>
  );
}
