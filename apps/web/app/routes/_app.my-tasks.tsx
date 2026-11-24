import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSearchParams, useSubmit } from "react-router";

import { APP_NAME, TASK_PRIORITIES, type MyTasksLoaderData } from "@pm/domain";

import { ListView } from "../components/tasks/TaskList";
import { Button, buttonClass } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { Page, Toolbar } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { translatePriority } from "../i18n/labels";
import { myTasksLoader } from "../loaders/myTasksLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `My tasks — ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  return myTasksLoader(ctx, request);
}

export default function MyTasksPage() {
  const { t } = useTranslation();
  const { tasks, filters, projects, statuses } = useLoaderData<MyTasksLoaderData>();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  function makePageUrl(newPage: number): string {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(newPage));
    return `?${next.toString()}`;
  }

  const hasFilters = Boolean(
    filters.projectId || filters.statusId || filters.priority || (filters.dueRange && filters.dueRange !== "all"),
  );

  return (
    <div data-testid="my-tasks-container" className="flex min-h-full flex-col">
      <Page
        header={<PageHeader title={t("my_tasks.title")} description={t("my_tasks.subtitle", { total: tasks.total })} />}
      >
        {/* Filters apply as soon as they change (server-side, in the URL). */}
        <Form
          method="get"
          data-testid="my-tasks-filter-bar"
          onChange={(event) => {
            void submit(event.currentTarget, { replace: true });
          }}
        >
          <Toolbar>
            <Select
              size="sm"
              name="projectId"
              aria-label={t("my_tasks.filter_project")}
              defaultValue={filters.projectId ?? ""}
              placeholder={t("my_tasks.filter_all_projects")}
              options={projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))}
              className="w-[200px]"
              data-testid="filter-project-select"
            />
            <Select
              size="sm"
              name="statusId"
              aria-label={t("my_tasks.filter_status")}
              defaultValue={filters.statusId ?? ""}
              placeholder={t("my_tasks.filter_all_statuses")}
              options={statuses.map((status) => ({ value: status.id, label: status.name }))}
              className="w-[150px]"
              data-testid="filter-status-select"
            />
            <Select
              size="sm"
              name="priority"
              aria-label={t("my_tasks.filter_priority")}
              defaultValue={filters.priority ?? ""}
              placeholder={t("my_tasks.filter_all_priorities")}
              options={[...TASK_PRIORITIES].reverse().map((priority) => ({
                value: priority,
                label: translatePriority(t, priority),
              }))}
              className="w-[150px]"
              data-testid="filter-priority-select"
            />
            <Select
              size="sm"
              name="dueRange"
              aria-label={t("my_tasks.filter_due_date")}
              defaultValue={filters.dueRange && filters.dueRange !== "all" ? filters.dueRange : ""}
              placeholder={t("my_tasks.filter_all_dates")}
              options={[
                { value: "overdue", label: t("my_tasks.filter_overdue") },
                { value: "today", label: t("my_tasks.filter_due_today") },
                { value: "week", label: t("my_tasks.filter_due_week") },
              ]}
              className="w-[150px]"
              data-testid="filter-due-range-select"
            />
            {hasFilters ? (
              <Link to="/my-tasks" className={buttonClass("ghost", "sm")} data-testid="reset-filters-link">
                <Icon name="x" size={14} />
                {t("my_tasks.btn_reset")}
              </Link>
            ) : null}
            <span className="flex-1" />
            <span className="text-[12px] leading-none text-fg-muted" data-testid="my-tasks-count">
              {t("my_tasks.count", { shown: tasks.items.length, total: tasks.total })}
            </span>
          </Toolbar>
        </Form>

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <ListView
            data-testid="my-tasks-table"
            tasks={tasks.items}
            statuses={statuses}
            hrefFor={(task) => `/projects/${task.projectId}/tasks/${task.id}`}
            empty={
              <EmptyState
                icon="square-check"
                title={t("my_tasks.empty_title")}
                description={t("my_tasks.empty_desc")}
                data-testid="empty-my-tasks"
              />
            }
          />

          {tasks.totalPages > 1 ? (
            <div
              className="flex items-center justify-between border-t border-line px-4 py-2.5"
              data-testid="pagination-bar"
            >
              <span className="text-[12px] leading-none text-fg-muted">
                {t("my_tasks.pagination_showing", {
                  from: (tasks.page - 1) * tasks.pageSize + 1,
                  to: Math.min(tasks.page * tasks.pageSize, tasks.total),
                  total: tasks.total,
                })}
              </span>
              <div className="flex items-center gap-2">
                {tasks.page > 1 ? (
                  <Link
                    to={makePageUrl(tasks.page - 1)}
                    className={buttonClass("secondary", "sm")}
                    data-testid="prev-page-button"
                  >
                    {t("my_tasks.pagination_prev")}
                  </Link>
                ) : (
                  <Button size="sm" disabled>
                    {t("my_tasks.pagination_prev")}
                  </Button>
                )}
                <span className="text-[12px] font-medium leading-none text-fg-secondary" data-testid="page-indicator">
                  {t("my_tasks.pagination_page_info", { page: tasks.page, total: tasks.totalPages })}
                </span>
                {tasks.page < tasks.totalPages ? (
                  <Link
                    to={makePageUrl(tasks.page + 1)}
                    className={buttonClass("secondary", "sm")}
                    data-testid="next-page-button"
                  >
                    {t("my_tasks.pagination_next")}
                  </Link>
                ) : (
                  <Button size="sm" disabled>
                    {t("my_tasks.pagination_next")}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Page>
    </div>
  );
}
