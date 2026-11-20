import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useNavigate, useParams, useRouteLoaderData, useSubmit } from "react-router";

import {
  APP_NAME,
  type MemberReportRow,
  type OverdueByStatusItem,
  type SprintWithStatsDto,
  type StaleReviewItem,
  type StatusDistributionItem,
  type SystemRole,
} from "@pm/domain";

import { Avatar, AvatarStack } from "../components/ui/Avatar";
import { Badge, roleTone } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button, buttonClass } from "../components/ui/Button";
import { cx } from "../components/ui/cx";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Panel, Toolbar } from "../components/ui/Page";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Select } from "../components/ui/Select";
import { StatCard } from "../components/ui/StatCard";
import { Table, type TableColumn } from "../components/ui/Table";
import { Tabs } from "../components/ui/Tabs";
import { StatusIcon, statusGlyph } from "../components/ui/TaskIcons";
import { translateCategory, translateRole } from "../i18n/labels";
import type { ProjectHeaderLoaderData } from "../loaders/projectHeaderLoader";
import { projectReportsLoader } from "../loaders/projectReportsLoader";
import { formatShortDate } from "../utils/format";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Reports — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectReportsLoader(ctx, request, projectId);
}

type CountKey = "todoCount" | "inProgressCount" | "reviewCount" | "doneCount" | "totalAssigned" | "overdueCount";

export default function ProjectReportsPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const submit = useSubmit();
  const headerData = useRouteLoaderData<ProjectHeaderLoaderData>("routes/_app.projects.$projectId");
  const { tab, memberReport, projectReport, sprints, filters, permissions } = useLoaderData<typeof loader>();
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const projectCode = headerData?.project.code ?? "";
  const shortDate = (value: string) => formatShortDate(value, i18n.language);

  const handleExportXlsx = async () => {
    if (!projectId) return;
    setIsExportingXlsx(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export?format=rows`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(t("project_reports.err_forbidden_export"));
        }
        throw new Error(t("project_reports.err_failed_export"));
      }
      const data = await res.json<{ columns: string[]; rows: string[][]; fileName: string }>();
      const { buildXlsx } = await import("../utils/xlsxExport.client");
      const bytes = await buildXlsx(data.columns, data.rows);
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("project_reports.err_failed_export_xlsx"));
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const tabs = [
    ...(permissions.canViewProjectReport
      ? [{ id: "project", label: t("project_reports.tab_project"), to: "?tab=project", "data-testid": "tab-project" }]
      : []),
    ...(permissions.canViewMemberReport
      ? [{ id: "members", label: t("project_reports.tab_members"), to: "?tab=members", "data-testid": "tab-members" }]
      : []),
  ];

  const count = (key: CountKey, label: string): TableColumn<MemberReportRow> => ({
    id: key,
    label,
    align: "right",
    width: 90,
    render: (row) => (
      <span
        className={cx(
          "tabular-nums",
          key === "totalAssigned" && "font-semibold",
          row[key] === 0 ? "text-fg-faint" : key === "overdueCount" && "text-due-overdue",
        )}
      >
        {row[key]}
      </span>
    ),
  });

  const overdueTotal = projectReport
    ? projectReport.bottlenecks.overdueByStatus.reduce((sum, item) => sum + item.overdueCount, 0)
    : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="project-reports-page">
      {exportError ? (
        <Banner tone="danger" role="alert" data-testid="export-error-msg">
          {exportError}
        </Banner>
      ) : null}

      <Toolbar>
        <Tabs items={tabs} value={tab} label={t("project_reports.title")} className="border-0" />
        <span className="flex-1" />
        {permissions.canExportProject && projectId ? (
          <>
            <a
              href={`/api/projects/${projectId}/export?format=csv`}
              download
              data-testid="export-csv-btn"
              className={buttonClass("secondary", "sm")}
            >
              <Icon name="arrow-down" size={14} />
              {t("project_reports.btn_export_csv")}
            </a>
            <Button
              size="sm"
              icon="arrow-down"
              disabled={isExportingXlsx}
              onClick={() => {
                void handleExportXlsx();
              }}
              data-testid="export-xlsx-btn"
            >
              {isExportingXlsx ? t("project_reports.btn_exporting") : t("project_reports.btn_export_xlsx")}
            </Button>
          </>
        ) : null}
      </Toolbar>

      {tab === "members" && memberReport ? (
        <>
          <Form
            method="get"
            data-testid="member-report-filters"
            onChange={(event) => {
              void submit(event.currentTarget, { replace: true });
            }}
          >
            <input type="hidden" name="tab" value="members" />
            <Toolbar>
              <Select
                size="sm"
                name="sprintId"
                aria-label={t("project_reports.filter_sprint")}
                defaultValue={filters.sprintId ?? ""}
                placeholder={t("project_reports.filter_all_sprints")}
                options={sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))}
                className="w-[170px]"
                data-testid="sprint-filter-select"
              />
              <Input
                type="date"
                size="sm"
                name="from"
                aria-label={t("project_reports.filter_completed_from")}
                title={t("project_reports.filter_completed_from")}
                defaultValue={filters.from ?? ""}
                fieldClassName="w-[150px]"
                className="w-[150px]"
                data-testid="from-date-filter"
              />
              <Input
                type="date"
                size="sm"
                name="to"
                aria-label={t("project_reports.filter_completed_to")}
                title={t("project_reports.filter_completed_to")}
                defaultValue={filters.to ?? ""}
                className="w-[150px]"
                data-testid="to-date-filter"
              />
              {filters.sprintId || filters.from || filters.to ? (
                <Link to="?tab=members" className={buttonClass("ghost", "sm")} data-testid="clear-filters-button">
                  <Icon name="x" size={14} />
                  {t("project_reports.btn_clear_filters")}
                </Link>
              ) : null}
            </Toolbar>
          </Form>
          <Panel title={t("project_reports.members_title")} subtitle={t("project_reports.members_desc")}>
            <Table<MemberReportRow>
              data-testid="member-report-table"
              rows={memberReport}
              rowKey={(row) => row.userId}
              rowTestId={(row) => `member-report-row-${row.userId}`}
              empty={t("project_reports.no_members")}
              columns={[
                {
                  id: "member",
                  label: t("project_reports.th_member"),
                  render: (row) => (
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Avatar name={row.fullName} src={row.avatarKey ? `/api/avatars/${row.userId}` : null} size={22} />
                      {row.fullName}
                    </span>
                  ),
                },
                {
                  id: "role",
                  label: t("project_reports.th_role"),
                  render: (row) => (
                    <Badge tone={roleTone(row.projectRole)} size="sm">
                      {translateRole(t, row.projectRole as SystemRole)}
                    </Badge>
                  ),
                },
                count("todoCount", translateCategory(t, "TODO")),
                count("inProgressCount", translateCategory(t, "IN_PROGRESS")),
                count("reviewCount", translateCategory(t, "REVIEW")),
                count("doneCount", translateCategory(t, "DONE")),
                count("totalAssigned", t("project_reports.th_total")),
                count("overdueCount", t("project_reports.th_overdue")),
                {
                  id: "completedInRange",
                  label: t("project_reports.th_completed_in_range"),
                  align: "right",
                  width: 140,
                  render: (row) => <span className="tabular-nums">{row.completedInRangeCount}</span>,
                },
              ]}
            />
          </Panel>
        </>
      ) : null}

      {tab === "project" && projectReport ? (
        <div className="flex flex-col gap-4" data-testid="project-report-section">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <StatCard
              label={t("project_reports.kpi_completion_rate")}
              value={`${String(projectReport.completionRate)}%`}
              hint={t("project_reports.kpi_completion_ratio", {
                done: projectReport.doneTasks,
                total: projectReport.totalTasks,
              })}
              data-testid="kpi-completion-rate"
            />
            <StatCard
              label={t("project_reports.kpi_total_tasks")}
              value={projectReport.totalTasks}
              hint={t("project_reports.kpi_total_tasks_desc")}
              data-testid="kpi-total-tasks"
            />
            <StatCard
              label={t("project_reports.kpi_bottlenecks")}
              value={projectReport.bottlenecks.staleReviews.length}
              tone={projectReport.bottlenecks.staleReviews.length ? "warning" : "neutral"}
              hint={t("project_reports.kpi_stale_reviews")}
              data-testid="kpi-bottlenecks-count"
            />
            <StatCard
              label={t("project_reports.th_overdue")}
              value={overdueTotal}
              tone={overdueTotal ? "danger" : "neutral"}
              hint={t("project_reports.kpi_overdue_tasks", { count: overdueTotal })}
              data-testid="kpi-overdue"
            />
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
            <Panel
              title={t("project_reports.status_distribution_title")}
              subtitle={t("project_reports.status_distribution_desc")}
              data-testid="status-distribution"
            >
              <Table<StatusDistributionItem>
                dense
                rows={projectReport.statusDistribution.filter((item) => item.taskCount > 0)}
                rowKey={(row) => row.statusId}
                rowTestId={(row) => `status-dist-row-${row.statusId}`}
                empty={t("project_reports.no_tasks")}
                columns={[
                  {
                    id: "status",
                    label: t("project_reports.th_status"),
                    render: (row) => (
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon category={statusGlyph(row.statusName, row.category)} />
                        {row.statusName}
                      </span>
                    ),
                  },
                  {
                    id: "category",
                    label: t("project_reports.th_category"),
                    muted: true,
                    render: (row) => translateCategory(t, row.category),
                  },
                  {
                    id: "count",
                    label: t("project_reports.th_count"),
                    align: "right",
                    width: 60,
                    render: (row) => <span className="tabular-nums">{row.taskCount}</span>,
                  },
                  {
                    id: "share",
                    label: t("project_reports.th_share"),
                    width: 150,
                    render: (row) => <ProgressBar value={row.percentage} />,
                  },
                ]}
              />
            </Panel>
            <Panel
              title={t("project_reports.sprint_completion_title")}
              subtitle={t("project_reports.sprint_completion_desc")}
              data-testid="sprint-completion-section"
            >
              <Table<SprintWithStatsDto>
                dense
                rows={projectReport.sprintCompletion}
                rowKey={(row) => row.id}
                rowTestId={(row) => `sprint-completion-row-${row.id}`}
                empty={t("project_reports.no_sprints")}
                columns={[
                  {
                    id: "sprint",
                    label: t("project_reports.th_sprint"),
                    render: (row) => <span className="font-medium">{row.name}</span>,
                  },
                  {
                    id: "dates",
                    label: t("project_reports.th_dates"),
                    muted: true,
                    render: (row) => `${shortDate(row.startDate)} – ${shortDate(row.endDate)}`,
                  },
                  {
                    id: "completion",
                    label: t("project_reports.th_completion_rate"),
                    width: 170,
                    render: (row) => (
                      <div data-testid="sprint-completion-value">
                        {row.taskCount ? (
                          <ProgressBar
                            value={row.completedCount}
                            total={row.taskCount}
                            tone={row.completedCount === row.taskCount ? "done" : "accent"}
                          />
                        ) : (
                          <span className="text-fg-muted">{t("project_reports.no_tasks")}</span>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </Panel>
          </div>

          <div data-testid="bottlenecks-section" className="flex flex-col gap-4">
            <Panel
              title={t("project_reports.stale_reviews_title")}
              subtitle={t("project_reports.stale_reviews_desc")}
              count={projectReport.bottlenecks.staleReviews.length}
              data-testid="stale-reviews-section"
            >
              <Table<StaleReviewItem>
                dense
                data-testid="stale-reviews-table"
                rows={projectReport.bottlenecks.staleReviews}
                rowKey={(row) => row.taskId}
                rowTestId={(row) => `stale-review-row-${row.taskId}`}
                onRowClick={(row) => {
                  void navigate(`/projects/${projectId ?? ""}/tasks/${row.taskId}`);
                }}
                empty={t("project_reports.no_stale_reviews")}
                columns={[
                  {
                    id: "task",
                    label: t("project_reports.th_task"),
                    render: (row) => (
                      <span className="inline-flex gap-2.5">
                        <span className="font-mono text-[12px] font-medium leading-[1.3] text-fg-muted">
                          {projectCode ? `${projectCode}-${String(row.taskNumber)}` : `#${String(row.taskNumber)}`}
                        </span>
                        <span className="font-medium">{row.title}</span>
                      </span>
                    ),
                  },
                  {
                    id: "status",
                    label: t("project_reports.th_status"),
                    render: (row) => (
                      <Badge tone="review" dot size="sm">
                        {row.statusName}
                      </Badge>
                    ),
                  },
                  {
                    id: "time",
                    label: t("project_reports.th_time_in_review"),
                    render: (row) => (
                      <Badge tone="warning" size="sm">
                        {t("project_reports.days_in_review", { days: row.daysInReview })}
                      </Badge>
                    ),
                  },
                  {
                    id: "assignees",
                    label: t("project_reports.th_assignees"),
                    render: (row) =>
                      row.assignees.length ? (
                        <AvatarStack names={row.assignees.map((assignee) => assignee.fullName)} size={20} />
                      ) : (
                        <span className="text-fg-muted">{t("project_reports.unassigned")}</span>
                      ),
                  },
                ]}
              />
            </Panel>
            <Panel
              title={t("project_reports.overdue_by_status_title")}
              subtitle={t("project_reports.overdue_by_status_desc")}
              count={overdueTotal}
              data-testid="overdue-by-status-section"
            >
              <Table<OverdueByStatusItem>
                dense
                data-testid="overdue-by-status-table"
                rows={projectReport.bottlenecks.overdueByStatus}
                rowKey={(row) => row.statusId}
                rowTestId={(row) => `overdue-status-row-${row.statusId}`}
                empty={t("project_reports.no_overdue_tasks")}
                columns={[
                  {
                    id: "status",
                    label: t("project_reports.th_status"),
                    render: (row) => (
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon category={statusGlyph(row.statusName, row.category)} />
                        {row.statusName}
                      </span>
                    ),
                  },
                  {
                    id: "category",
                    label: t("project_reports.th_category"),
                    muted: true,
                    render: (row) => translateCategory(t, row.category),
                  },
                  {
                    id: "count",
                    label: t("project_reports.th_overdue_count"),
                    align: "right",
                    render: (row) => (
                      <Badge tone="danger" size="sm">
                        {row.overdueCount}
                      </Badge>
                    ),
                  },
                ]}
              />
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
