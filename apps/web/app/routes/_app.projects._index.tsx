import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectsLoader } from "../loaders/projectsLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Projects — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectsLoader(ctx, request);
}

export default function ProjectsIndexPage() {
  const { projects, canCreate, filter, isAdmin } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("projects.title")}</h1>
            <p className="text-sm text-gray-600">{t("projects.description")}</p>
          </div>
          {canCreate ? (
            <Link
              to="/projects/new"
              data-testid="new-project-button"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              {t("projects.new_project")}
            </Link>
          ) : null}
        </div>

        {/* Admin Filter Tabs */}
        {isAdmin ? (
          <div className="flex border-b border-gray-200 gap-4" data-testid="projects-filter-tabs">
            <Link
              to="/projects"
              data-testid="filter-active"
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                filter !== "archived"
                  ? "border-blue-600 text-blue-600 font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t("projects.active")}
            </Link>
            <Link
              to="/projects?filter=archived"
              data-testid="filter-archived"
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                filter === "archived"
                  ? "border-blue-600 text-blue-600 font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t("projects.archived")}
            </Link>
          </div>
        ) : null}

        {/* Projects List */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {projects.length === 0 ? (
            <div className="p-12 text-center" data-testid="empty-projects">
              <p className="text-base font-semibold text-gray-900">{t("projects.empty_title")}</p>
              <p className="mt-1 text-sm text-gray-500">
                {filter === "archived"
                  ? t("projects.empty_archived")
                  : canCreate
                    ? t("projects.empty_can_create")
                    : t("projects.empty_not_assigned")}
              </p>
              {canCreate && filter !== "archived" ? (
                <div className="mt-6">
                  <Link
                    to="/projects/new"
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
                  >
                    {t("projects.create_button")}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm" data-testid="projects-table">
                <thead className="bg-gray-50 text-gray-600 font-medium">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_code")}
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_name")}
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_status")}
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_timeline")}
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_budget")}
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      {t("projects.th_role")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className="hover:bg-gray-50 transition-colors"
                      data-testid={`project-row-${project.code}`}
                    >
                      <td className="px-6 py-4 font-mono font-medium text-blue-600">
                        <Link to={`/projects/${project.id}`} className="hover:underline">
                          {project.code}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Link to={`/projects/${project.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                          {project.name}
                        </Link>
                        {project.description ? (
                          <div className="text-xs text-gray-500 line-clamp-1">{project.description}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            project.deletedAt
                              ? "bg-gray-200 text-gray-700"
                              : project.status === "ACTIVE"
                                ? "bg-green-100 text-green-800"
                                : project.status === "ON_HOLD"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {project.deletedAt ? t("projects.status_archived") : project.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 whitespace-nowrap">
                        {project.startDate} → {project.endDate}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 whitespace-nowrap">
                        {project.budget !== null ? `${project.budget.toLocaleString()} VND` : "—"}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-gray-700">
                        {"projectRole" in project && typeof project.projectRole === "string" ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                            {project.projectRole}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
