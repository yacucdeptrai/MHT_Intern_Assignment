import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectReportsLoader } from "../loaders/projectReportsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Project Reports — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectReportsLoader(ctx, request, projectId);
}

export default function ProjectReportsPage() {
  const { tab, memberReport, sprints, filters, permissions } = useLoaderData<typeof loader>();

  const currentTab = tab;

  return (
    <div className="space-y-6" data-testid="project-reports-page">
      {/* Header and Tab Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">Analyze team workload, task distribution, and performance.</p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {permissions.canViewMemberReport && (
            <Link
              to="?tab=members"
              data-testid="tab-members"
              className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                currentTab === "members"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Members
            </Link>
          )}
          {permissions.canViewProjectReport && (
            <Link
              to="?tab=project"
              data-testid="tab-project"
              className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                currentTab === "project"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Project
            </Link>
          )}
        </div>
      </div>

      {/* Member Report Tab */}
      {currentTab === "members" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <Form method="get" className="flex flex-wrap items-end gap-4" data-testid="member-report-filters">
              <input type="hidden" name="tab" value="members" />

              <div className="flex flex-col gap-1">
                <label htmlFor="sprintId" className="text-xs font-semibold text-gray-700">
                  Sprint
                </label>
                <select
                  id="sprintId"
                  name="sprintId"
                  defaultValue={filters.sprintId ?? ""}
                  data-testid="sprint-filter-select"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Sprints</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="from" className="text-xs font-semibold text-gray-700">
                  Completed From
                </label>
                <input
                  type="date"
                  id="from"
                  name="from"
                  defaultValue={filters.from ?? ""}
                  data-testid="from-date-filter"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="to" className="text-xs font-semibold text-gray-700">
                  Completed To
                </label>
                <input
                  type="date"
                  id="to"
                  name="to"
                  defaultValue={filters.to ?? ""}
                  data-testid="to-date-filter"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  data-testid="apply-filters-button"
                  className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Apply Filters
                </button>
                {(filters.sprintId || filters.from || filters.to) && (
                  <Link
                    to="?tab=members"
                    data-testid="clear-filters-button"
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Clear
                  </Link>
                )}
              </div>
            </Form>
          </div>

          {/* Members Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200" data-testid="member-report-table">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      Member
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      Role
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      To Do
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      In Progress
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      Review
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      Done
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-900"
                    >
                      Total
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-600"
                    >
                      Overdue
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-green-700"
                    >
                      Completed in Range
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {!memberReport || memberReport.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                        No member statistics found for this project.
                      </td>
                    </tr>
                  ) : (
                    memberReport.map((row) => (
                      <tr
                        key={row.userId}
                        data-testid={`member-report-row-${row.userId}`}
                        className="hover:bg-gray-50/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-gray-900">{row.fullName}</div>
                          <div className="text-xs text-gray-500">{row.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-gray-600">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                            {row.projectRole}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-gray-600">
                          {row.todoCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-blue-600 font-medium">
                          {row.inProgressCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-amber-600 font-medium">
                          {row.reviewCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-green-600 font-medium">
                          {row.doneCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-gray-900">
                          {row.totalAssigned}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium text-red-600">
                          {row.overdueCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              {row.overdueCount}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-green-700">
                          {row.completedInRangeCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                              {row.completedInRangeCount}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Project Report Tab (Placeholder for M8-T5) */}
      {currentTab === "project" && (
        <div data-testid="project-report-section" className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Project progress, completion rate, and bottlenecks.</p>
        </div>
      )}
    </div>
  );
}
