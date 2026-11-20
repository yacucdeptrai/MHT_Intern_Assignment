import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useLocation, useRouteLoaderData } from "react-router";

import { APP_NAME } from "@pm/domain";

import { Badge, type BadgeTone } from "../components/ui/Badge";
import { buttonClass } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/ui/PageHeader";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { translateProjectStatus, translateRole } from "../i18n/labels";
import { projectHeaderLoader } from "../loaders/projectHeaderLoader";
import type { ProjectTasksLoaderData } from "../loaders/projectTasksLoader";
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

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "done", ON_HOLD: "warning", COMPLETED: "neutral" };

export default function ProjectLayout() {
  const { project, permissions } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const base = `/projects/${project.id}`;
  const tabs: TabItem[] = [
    { id: "tasks", label: t("project_layout.tab_tasks"), to: base, count: project.taskCount },
    { id: "sprints", label: t("project_layout.tab_sprints"), to: `${base}/sprints` },
    { id: "members", label: t("project_layout.tab_members"), to: `${base}/members`, count: project.memberCount },
    ...(permissions.canManageProject
      ? [{ id: "settings", label: t("project_layout.tab_settings"), to: `${base}/settings` }]
      : []),
    ...(permissions.canViewMemberReport || permissions.canViewProjectReport
      ? [{ id: "reports", label: t("project_layout.tab_reports"), to: `${base}/reports` }]
      : []),
  ].map((tab) => ({ ...tab, "data-testid": `tab-${tab.id}` }));

  const sub = pathname.slice(base.length).split("/")[1] ?? "";
  const activeTab = tabs.some((tab) => tab.id === sub) ? sub : "tasks";
  const roleLabel = translateRole(t, project.projectRole);
  const tasksData = useRouteLoaderData<ProjectTasksLoaderData>("routes/_app.projects.$projectId._index");
  // Only the task list itself is full-bleed; other tabs (and the task page) use the padded column.
  const isTasksTab = activeTab === "tasks" && pathname.replace(/\/+$/, "") === base;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        data-testid="project-header"
        titleTestId="project-title"
        dense
        eyebrow={
          <>
            <Badge tone="accent" size="sm">
              {project.code}
            </Badge>
            {t("project_layout.eyebrow")}
          </>
        }
        title={project.name}
        meta={
          <>
            {project.isArchived ? (
              <Badge tone="warning" dot>
                {t("project_layout.status_archived")}
              </Badge>
            ) : (
              <Badge tone={STATUS_TONE[project.status] ?? "neutral"} dot>
                {translateProjectStatus(t, project.status)}
              </Badge>
            )}
            <Badge tone="outline" data-testid="project-role-badge">
              {t("project_layout.your_role_badge", { role: roleLabel })}
            </Badge>
          </>
        }
        description={project.description ?? undefined}
        actions={
          isTasksTab && tasksData?.canCreate ? (
            <Link to={`${base}?new=1`} className={buttonClass("primary", "sm")} data-testid="create-task-button">
              <Icon name="plus" size={14} />
              {t("project_tasks.btn_new_task")}
            </Link>
          ) : null
        }
        tabs={<Tabs items={tabs} value={activeTab} label={t("project_layout.aria_tabs")} />}
      />
      {isTasksTab ? (
        <Outlet />
      ) : (
        <div className="flex w-full max-w-[1176px] flex-col gap-4 px-7 pb-10 pt-5">
          <Outlet />
        </div>
      )}
    </div>
  );
}
