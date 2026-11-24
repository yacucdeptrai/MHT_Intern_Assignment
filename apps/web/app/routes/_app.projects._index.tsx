import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";

import { APP_NAME, type ProjectStatus, type SystemRole } from "@pm/domain";

import { Badge, roleTone, type BadgeTone } from "../components/ui/Badge";
import { buttonClass } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { Page } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { projectDot } from "../components/ui/projectColor";
import { Table } from "../components/ui/Table";
import { Tabs } from "../components/ui/Tabs";
import { translateProjectStatus, translateRole } from "../i18n/labels";
import { projectsLoader } from "../loaders/projectsLoader";
import { formatShortDate } from "../utils/format";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Projects — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return projectsLoader(ctx, request);
}

const STATUS_TONE: Record<ProjectStatus, BadgeTone> = { ACTIVE: "done", ON_HOLD: "warning", COMPLETED: "neutral" };

/** VND with thousands separators, e.g. "450,000,000 ₫". */
function formatBudget(budget: number | null): string {
  return budget ? `${budget.toLocaleString("en-US")} ₫` : "—";
}

type ProjectRow = Awaited<ReturnType<typeof projectsLoader>>["projects"][number];

export default function ProjectsIndexPage() {
  const { projects, progress, counts, canCreate, filter, isAdmin } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArchivedTab = filter === "archived";

  const emptyText = isArchivedTab
    ? t("projects.empty_archived")
    : canCreate
      ? t("projects.empty_can_create")
      : t("projects.empty_not_assigned");

  return (
    <Page
      header={
        <PageHeader
          title={t("projects.title")}
          description={t("projects.description")}
          actions={
            canCreate ? (
              <Link to="/projects/new" className={buttonClass("primary", "sm")} data-testid="new-project-button">
                <Icon name="plus" size={14} />
                {t("projects.new_project")}
              </Link>
            ) : null
          }
          tabs={
            isAdmin ? (
              <div data-testid="projects-filter-tabs">
                <Tabs
                  value={isArchivedTab ? "archived" : "active"}
                  items={[
                    {
                      id: "active",
                      label: t("projects.active"),
                      count: counts.active,
                      to: "/projects",
                      "data-testid": "filter-active",
                    },
                    {
                      id: "archived",
                      label: t("projects.archived"),
                      count: counts.archived,
                      to: "/projects?filter=archived",
                      "data-testid": "filter-archived",
                    },
                  ]}
                />
              </div>
            ) : null
          }
        />
      }
    >
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {projects.length === 0 ? (
          <EmptyState
            icon="folder-kanban"
            title={t("projects.empty_title")}
            description={emptyText}
            data-testid="empty-projects"
            action={
              canCreate && !isArchivedTab ? (
                <Link to="/projects/new" className={buttonClass("primary", "sm")}>
                  <Icon name="plus" size={14} />
                  {t("projects.new_project")}
                </Link>
              ) : null
            }
          />
        ) : (
          <Table<ProjectRow>
            data-testid="projects-table"
            rows={projects}
            rowKey={(row) => row.id}
            rowTestId={(row) => `project-row-${row.code}`}
            onRowClick={
              isArchivedTab
                ? undefined
                : (row) => {
                    void navigate(`/projects/${row.id}`);
                  }
            }
            columns={[
              {
                id: "code",
                label: t("projects.th_code"),
                width: 80,
                render: (row) =>
                  row.deletedAt ? (
                    <Badge tone="accent">{row.code}</Badge>
                  ) : (
                    <Link
                      to={`/projects/${row.id}`}
                      className="no-underline hover:no-underline"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <Badge tone="accent">{row.code}</Badge>
                    </Link>
                  ),
              },
              {
                id: "name",
                label: t("projects.th_name"),
                render: (row) => {
                  const label = (
                    <span className="inline-flex items-center gap-2 font-medium text-fg">
                      <span className="size-2 rounded-[2px]" style={{ background: projectDot(row.code) }} />
                      {row.name}
                    </span>
                  );
                  return row.deletedAt ? (
                    label
                  ) : (
                    <Link
                      to={`/projects/${row.id}`}
                      className="no-underline hover:no-underline"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {label}
                    </Link>
                  );
                },
              },
              {
                id: "status",
                label: t("projects.th_status"),
                render: (row) =>
                  row.deletedAt ? (
                    <Badge>{t("projects.status_archived")}</Badge>
                  ) : (
                    <Badge tone={STATUS_TONE[row.status]} dot>
                      {translateProjectStatus(t, row.status)}
                    </Badge>
                  ),
              },
              {
                id: "progress",
                label: t("projects.th_progress"),
                width: 180,
                render: (row) => {
                  const counts = progress[row.id] ?? { total: 0, done: 0 };
                  return <ProgressBar value={counts.done} total={counts.total || 1} tone="done" />;
                },
              },
              {
                id: "timeline",
                label: t("projects.th_timeline"),
                muted: true,
                render: (row) =>
                  `${formatShortDate(row.startDate, i18n.language)} – ${formatShortDate(row.endDate, i18n.language)}`,
              },
              ...(isAdmin
                ? [
                    {
                      id: "budget",
                      label: t("projects.th_budget"),
                      align: "right" as const,
                      muted: true,
                      render: (row: ProjectRow) => formatBudget(row.budget),
                    },
                  ]
                : []),
              {
                id: "role",
                label: t("projects.th_role"),
                render: (row) => {
                  const role =
                    ("projectRole" in row ? (row.projectRole as SystemRole) : null) ?? (isAdmin ? "ADMIN" : null);
                  return role ? (
                    <Badge tone={roleTone(role)} size="sm">
                      {translateRole(t, role)}
                    </Badge>
                  ) : (
                    "—"
                  );
                },
              },
            ]}
          />
        )}
      </div>
    </Page>
  );
}
