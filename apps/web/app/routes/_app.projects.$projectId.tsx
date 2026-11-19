import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { NavLink, Outlet, useLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { projectHeaderLoader } from "../loaders/projectHeaderLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta({ data }: { data?: Awaited<ReturnType<typeof projectHeaderLoader>> }) {
  const code = data?.project.code;
  const name = data?.project.name;
  return [{ title: code && name ? `${code} — ${name} — ${APP_NAME}` : `Project — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectHeaderLoader(ctx, request, projectId);
}

export default function ProjectLayout() {
  const { project, permissions } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  const navItems = [
    { id: "tasks", label: t("project_layout.tab_tasks"), to: `/projects/${project.id}`, end: true },
    { id: "sprints", label: t("project_layout.tab_sprints"), to: `/projects/${project.id}/sprints`, end: false },
    { id: "members", label: t("project_layout.tab_members"), to: `/projects/${project.id}/members`, end: false },
    ...(permissions.canManageProject
      ? [
          {
            id: "settings",
            label: t("project_layout.tab_settings"),
            to: `/projects/${project.id}/settings`,
            end: false,
          },
        ]
      : []),
    ...(permissions.canViewMemberReport || permissions.canViewProjectReport
      ? [{ id: "reports", label: t("project_layout.tab_reports"), to: `/projects/${project.id}/reports`, end: false }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Project Header Banner */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" data-testid="project-header">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                  {project.code}
                </span>
                <h1 className="text-2xl font-bold text-gray-900" data-testid="project-title">
                  {project.name}
                </h1>
                {project.isArchived ? (
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    {t("project_layout.status_archived")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    {project.status}
                  </span>
                )}
              </div>
              {project.description ? (
                <p className="text-sm text-gray-600 max-w-3xl pt-1">{project.description}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("project_layout.your_role")}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
                {project.projectRole}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-6" aria-label={t("project_layout.aria_tabs")}>
              {navItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`
                  }
                  data-testid={`tab-${item.id}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Child Route Outlet */}
        <Outlet />
      </div>
    </div>
  );
}
