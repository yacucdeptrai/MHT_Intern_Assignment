import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { OverdueItem, ProjectRiskItem, StatusCategory, TaskListItem, TaskPriority } from "@pm/domain";

import { formatShortDate } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { buttonClass } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { EmptyLine, Page, Panel } from "../ui/Page";
import { PageHeader } from "../ui/PageHeader";
import { StatCard } from "../ui/StatCard";
import { Table } from "../ui/Table";
import { DueLabel, PriorityIcon, StatusIcon, statusGlyph } from "../ui/TaskIcons";

export interface DashboardViewProps {
  fullName: string;
  unreadCount: number;
  inProgress: TaskListItem[];
  inReview: TaskListItem[];
  todayPriorities: TaskListItem[];
  overdue: OverdueItem[];
  /** Admin & PM portal only: projects with overdue work */
  projectsAtRisk?: ProjectRiskItem[];
  /** Admin sees the organization; a PM sees their own projects */
  isOrgWide?: boolean;
  isPortal: boolean;
  testId: string;
}

interface MiniRowTask {
  id: string;
  projectId: string;
  projectCode?: string | undefined;
  number: number;
  title: string;
  priority?: TaskPriority | undefined;
  statusName?: string | undefined;
  statusCategory?: StatusCategory | undefined;
}

function taskKey(task: MiniRowTask): string {
  return task.projectCode ? `${task.projectCode}-${String(task.number)}` : `#${String(task.number)}`;
}

/** 38px task row: priority, key, status glyph, title, right-hand detail. */
function MiniRow({ task, right, testId }: { task: MiniRowTask; right?: ReactNode; testId?: string }) {
  const category = task.statusCategory ?? "TODO";
  return (
    <Link
      to={`/projects/${task.projectId}/tasks/${task.id}`}
      data-testid={testId}
      className="flex h-[38px] items-center gap-2.5 border-b border-line px-4 no-underline last:border-b-0 hover:bg-hover hover:no-underline"
    >
      <PriorityIcon priority={task.priority ?? "MEDIUM"} />
      <span className="w-[58px] shrink-0 truncate font-mono text-[12px] font-medium leading-none text-fg-muted">
        {taskKey(task)}
      </span>
      <StatusIcon category={statusGlyph(task.statusName, category)} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.2] text-fg">{task.title}</span>
      {right}
    </Link>
  );
}

function useTodayLabel(): string {
  const { i18n } = useTranslation();
  return new Intl.DateTimeFormat(i18n.language.startsWith("vi") ? "vi-VN" : "en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

/** Personal dashboard (member) and the Admin & PM portal dashboard, which adds projects at risk. */
export function DashboardView({
  fullName,
  unreadCount,
  inProgress,
  inReview,
  todayPriorities,
  overdue,
  projectsAtRisk,
  isOrgWide = false,
  isPortal,
  testId,
}: DashboardViewProps) {
  const { t, i18n } = useTranslation();
  const today = useTodayLabel();
  const shortDate = (value: string) => formatShortDate(value, i18n.language);
  const daysOverdue = (count: number) =>
    count === 1 ? t("dashboard.days_overdue_one", { count }) : t("dashboard.days_overdue_other", { count });
  const oldest = overdue[0]?.daysOverdue;

  return (
    <div data-testid={testId} className="flex min-h-full flex-col">
      <Page
        header={
          <PageHeader
            eyebrow={isPortal ? t("nav.admin_portal") : <span suppressHydrationWarning>{today}</span>}
            title={t("dashboard.title")}
            description={t("dashboard.welcome", { name: fullName })}
            meta={
              <Link
                to="/notifications"
                className="no-underline hover:no-underline"
                data-testid="unread-notifications-indicator"
              >
                {unreadCount > 0 ? (
                  <Badge tone="accent" dot>
                    {t("dashboard.unread_badge", { count: unreadCount })}
                  </Badge>
                ) : (
                  <Badge>{t("dashboard.notifications_up_to_date")}</Badge>
                )}
              </Link>
            }
          />
        }
      >
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <StatCard
            label={t("dashboard.stat_in_progress")}
            value={inProgress.length}
            icon="circle-dot"
            to="/my-tasks"
            data-testid="stat-in-progress"
          />
          <StatCard
            label={t("dashboard.stat_review")}
            value={inReview.length}
            icon="circle-dot-dashed"
            to="/my-tasks"
            data-testid="stat-review"
          />
          <StatCard
            label={t("dashboard.stat_priorities")}
            value={todayPriorities.length}
            icon="flag"
            data-testid="stat-priorities"
          />
          <StatCard
            label={t("dashboard.stat_overdue")}
            value={overdue.length}
            icon="clock"
            tone={overdue.length ? "danger" : "neutral"}
            hint={
              oldest != null
                ? oldest === 1
                  ? t("dashboard.overdue_oldest_one", { count: oldest })
                  : t("dashboard.overdue_oldest_other", { count: oldest })
                : t("dashboard.nothing_overdue")
            }
            data-testid="stat-overdue"
          />
        </div>

        {projectsAtRisk ? (
          <Panel
            title={t("dashboard.at_risk_title")}
            subtitle={isOrgWide ? t("dashboard.at_risk_subtitle_org") : t("dashboard.at_risk_subtitle_user")}
            count={projectsAtRisk.length}
            data-testid="projects-at-risk-section"
          >
            <Table<ProjectRiskItem>
              dense
              rows={projectsAtRisk}
              rowKey={(row) => row.id}
              rowTestId={(row) => `at-risk-${row.code}`}
              empty={t("dashboard.no_at_risk")}
              columns={[
                {
                  id: "code",
                  label: t("dashboard.th_code"),
                  width: 80,
                  render: (row) => <Badge tone="accent">{row.code}</Badge>,
                },
                {
                  id: "name",
                  label: t("dashboard.th_project"),
                  render: (row) => <span className="font-medium">{row.name}</span>,
                },
                {
                  id: "overdue",
                  label: t("dashboard.th_overdue"),
                  render: (row) => (
                    <Badge tone="danger" size="sm">
                      {t("dashboard.overdue_badge", { count: row.overdueCount })}
                    </Badge>
                  ),
                },
                { id: "pm", label: t("dashboard.th_pm"), muted: true, render: (row) => row.pmName ?? "—" },
                {
                  id: "action",
                  label: "",
                  align: "right",
                  render: (row) => (
                    <Link to={`/projects/${row.id}`} className={buttonClass("ghost", "sm")}>
                      {t("dashboard.view_project")}
                      <Icon name="arrow-up-right" size={14} style={{ opacity: 0.7 }} />
                    </Link>
                  ),
                },
              ]}
            />
          </Panel>
        ) : null}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
          <Panel
            title={t("dashboard.overdue_title")}
            subtitle={t("dashboard.overdue_subtitle")}
            count={overdue.length}
            data-testid="overdue-widget"
          >
            {overdue.length ? (
              overdue.map((task) => (
                <MiniRow
                  key={task.id}
                  task={task}
                  testId="overdue-item"
                  right={
                    <>
                      <span className="whitespace-nowrap text-[12px] leading-none text-fg-muted">
                        {t("dashboard.due_date", { date: shortDate(task.dueDate) })}
                      </span>
                      <Badge tone="danger" size="sm">
                        {daysOverdue(task.daysOverdue)}
                      </Badge>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyLine>{t("dashboard.no_overdue")}</EmptyLine>
            )}
          </Panel>
          <Panel
            title={t("dashboard.today_priorities_title")}
            subtitle={t("dashboard.today_priorities_subtitle")}
            count={todayPriorities.length}
            data-testid="today-priorities-section"
          >
            {todayPriorities.length ? (
              todayPriorities.map((task) => (
                <MiniRow
                  key={task.id}
                  task={task}
                  testId="priority-item"
                  right={
                    <DueLabel
                      date={task.dueDate ? shortDate(task.dueDate) : null}
                      due={task.isOverdue ? "overdue" : task.isDueSoon ? "soon" : null}
                      size="sm"
                    />
                  }
                />
              ))
            ) : (
              <EmptyLine>{t("dashboard.no_today_priorities")}</EmptyLine>
            )}
          </Panel>
        </div>

        <Panel
          title={t("dashboard.in_progress_title")}
          subtitle={t("dashboard.in_progress_subtitle")}
          count={inProgress.length}
          data-testid="in-progress-section"
        >
          {inProgress.length ? (
            inProgress.map((task) => (
              <MiniRow
                key={task.id}
                task={task}
                testId="in-progress-item"
                right={
                  <>
                    {task.projectCode ? (
                      <Badge tone="outline" size="sm">
                        {task.projectCode}
                      </Badge>
                    ) : null}
                    <span className="w-[70px] truncate text-right text-[12px] leading-none text-fg-muted">
                      {task.statusName}
                    </span>
                  </>
                }
              />
            ))
          ) : (
            <EmptyLine>{t("dashboard.no_in_progress")}</EmptyLine>
          )}
        </Panel>
      </Page>
    </div>
  );
}
