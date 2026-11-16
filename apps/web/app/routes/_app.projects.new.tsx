import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useNavigation } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectCreateAction } from "../actions/projectCreateAction";
import { projectCreateLoader } from "../loaders/projectCreateLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Create Project — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectCreateLoader(ctx, request);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectCreateAction(ctx, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export default function ProjectCreatePage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const formError = actionData?.errors?.form?.[0] ?? actionData?.message;
  const codeError = actionData?.errors?.code?.[0];
  const nameError = actionData?.errors?.name?.[0];
  const descriptionError = actionData?.errors?.description?.[0];
  const budgetError = actionData?.errors?.budget?.[0];
  const startDateError = actionData?.errors?.startDate?.[0];
  const endDateError = actionData?.errors?.endDate?.[0];
  const slackChannelError = actionData?.errors?.slackChannelId?.[0];

  const values = actionData?.values ?? {};

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/projects" className="hover:text-gray-900 transition-colors">
            Projects
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">New</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
          <p className="text-sm text-gray-600">
            Set up a new project workspace, define timeline, and allocate initial budget.
          </p>
        </div>

        {/* Global Error Banner */}
        {formError ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200" data-testid="form-error">
            {formError}
          </div>
        ) : null}

        {/* Form Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Form method="post" className="space-y-6" data-testid="create-project-form">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Project Code */}
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                  Project Code <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="code"
                    name="code"
                    required
                    maxLength={10}
                    defaultValue={values.code ?? ""}
                    placeholder="e.g. PRJ-101"
                    data-testid="input-code"
                    className={`block w-full uppercase font-mono rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                      codeError
                        ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">2–10 uppercase letters, numbers, or hyphens.</p>
                {codeError ? (
                  <p className="mt-1 text-xs text-red-600" data-testid="error-code">
                    {codeError}
                  </p>
                ) : null}
              </div>

              {/* Project Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    maxLength={150}
                    defaultValue={values.name ?? ""}
                    placeholder="e.g. Mobile App Redesign"
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
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <div className="mt-1">
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  maxLength={10000}
                  defaultValue={values.description ?? ""}
                  placeholder="Outline high-level goals and project scope..."
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

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                    min={0}
                    defaultValue={values.budget ?? ""}
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

              {/* Slack Channel ID */}
              <div>
                <label htmlFor="slackChannelId" className="block text-sm font-medium text-gray-700">
                  Slack Channel ID
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="slackChannelId"
                    name="slackChannelId"
                    maxLength={50}
                    defaultValue={values.slackChannelId ?? ""}
                    placeholder="e.g. C0123456789"
                    data-testid="input-slack"
                    className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                      slackChannelError
                        ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                  />
                </div>
                {slackChannelError ? (
                  <p className="mt-1 text-xs text-red-600" data-testid="error-slack">
                    {slackChannelError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Start Date */}
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
                    defaultValue={values.startDate ?? ""}
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

              {/* End Date */}
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
                    defaultValue={values.endDate ?? ""}
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <Link
                to="/projects"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-project-button"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Creating..." : "Create Project"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
