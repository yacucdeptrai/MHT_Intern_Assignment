import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useParams,
  useRouteLoaderData,
  useSearchParams,
  useSubmit,
} from "react-router";

import { APP_NAME, getTodayDateString, TASK_PRIORITIES, type TaskListItem } from "@pm/domain";

import { projectTasksAction } from "../actions/projectTasksAction";
import { ListView } from "../components/tasks/TaskList";
import { BoardView, TimelineView } from "../components/tasks/TaskViews";
import { Banner } from "../components/ui/Banner";
import { Button, buttonClass } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Select } from "../components/ui/Select";
import { Toast } from "../components/ui/Toast";
import { ViewSwitcher } from "../components/ui/ViewSwitcher";
import { translatePriority } from "../i18n/labels";
import type { ProjectHeaderLoaderData } from "../loaders/projectHeaderLoader";
import { projectTasksLoader, type ProjectTasksLoaderData } from "../loaders/projectTasksLoader";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Tasks — ${APP_NAME}` }];
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksLoader(ctx, projectId, request);
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const projectId = params.projectId ?? "";
  return projectTasksAction(ctx, projectId, request);
}

interface ActionData {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

type TaskView = "list" | "board" | "timeline";

function parseView(value: string | null): TaskView {
  return value === "board" || value === "timeline" ? value : "list";
}

export default function ProjectIndexPage() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const {
    tasks: taskPage,
    members,
    statuses,
    sprints,
    filters,
    canCreate,
    canAssign,
  } = useLoaderData<ProjectTasksLoaderData>();
  const headerData = useRouteLoaderData<ProjectHeaderLoaderData>("routes/_app.projects.$projectId");
  // Project task rows do not repeat the project code; add it so keys read MOB-142.
  const projectCode = headerData?.project.code;
  const tasks = {
    ...taskPage,
    items: taskPage.items.map((task) => (task.projectCode || !projectCode ? task : { ...task, projectCode })),
  };
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const submit = useSubmit();
  const moveFetcher = useFetcher<ActionData>();

  const view = parseView(searchParams.get("view"));
  const hasViewParam = view !== "list";
  const isCreateRequested = searchParams.has("new");
  const hasOtherFilters = Boolean(filters.statusId || filters.assigneeId || filters.priority);
  const [isFilterOpen, setIsFilterOpen] = useState(hasOtherFilters);

  // A failed create keeps the dialog open with the typed values; a successful one closes it.
  const isCreateError = Boolean(actionData && !actionData.success && actionData.values);
  const isDialogOpen = canCreate && (isCreateRequested || isCreateError);
  useEffect(() => {
    if (actionData?.success && searchParams.has("new")) {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [actionData, searchParams, setSearchParams]);

  const isSubmitting = navigation.state === "submitting";
  const hrefFor = (task: TaskListItem) => `/projects/${projectId}/tasks/${task.id}`;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  // New tasks start in the default status, so group "+" buttons just open the form.
  const openCreate = () => {
    setParam("new", "1");
  };
  const closeCreate = () => {
    setParam("new", null);
  };

  const makePageUrl = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    return `?${next.toString()}`;
  };

  const moveTask = (task: TaskListItem, statusId: string) => {
    if (task.version == null) {
      return;
    }
    void moveFetcher.submit(
      { intent: "changeStatus", statusId, version: String(task.version) },
      { method: "post", action: `/projects/${projectId}/tasks/${task.id}` },
    );
  };
  const moveError = moveFetcher.data && !moveFetcher.data.success ? moveFetcher.data.message : null;

  const emptyState = (
    <EmptyState
      icon="square-check"
      title={t("project_tasks.empty_title")}
      description={t("project_tasks.empty_desc")}
      data-testid="empty-tasks"
      action={
        canCreate ? (
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() => {
              openCreate();
            }}
          >
            {t("project_tasks.btn_new_task")}
          </Button>
        ) : null
      }
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="project-tasks">
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line py-2 pl-7 pr-5"
        data-testid="project-tasks-view-bar"
      >
        <ViewSwitcher<TaskView>
          label={t("project_tasks.view_label")}
          value={view}
          onChange={(next) => {
            setParam("view", next === "list" ? null : next);
          }}
          views={[
            { id: "list", label: t("project_tasks.view_list"), icon: "layout-list", "data-testid": "view-list" },
            { id: "board", label: t("project_tasks.view_board"), icon: "kanban", "data-testid": "view-board" },
            {
              id: "timeline",
              label: t("project_tasks.view_timeline"),
              icon: "chart-gantt",
              "data-testid": "view-timeline",
            },
          ]}
        />
        <Select
          size="sm"
          aria-label={t("project_tasks.filter_sprint")}
          value={filters.sprintId ?? ""}
          onChange={(event) => {
            setParam("sprintId", event.target.value || null);
          }}
          placeholder={t("project_tasks.all_sprints")}
          options={[
            ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
            { value: "backlog", label: t("project_tasks.backlog") },
          ]}
          className="w-[170px]"
          data-testid="filter-sprint-select"
        />
        <span className="flex-1" />
        <span className="mr-1 text-[12px] leading-none text-fg-muted" data-testid="project-tasks-count">
          {tasks.total === 1
            ? t("project_tasks.count_one", { count: tasks.total })
            : t("project_tasks.count_other", { count: tasks.total })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon="list-filter"
          aria-expanded={isFilterOpen}
          onClick={() => {
            setIsFilterOpen((open) => !open);
          }}
          data-testid="toggle-filters-button"
        >
          {t("project_tasks.btn_filter")}
        </Button>
      </div>

      {isFilterOpen ? (
        <Form
          method="get"
          data-testid="project-tasks-filters"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-subtle py-2 pl-7 pr-5"
          onChange={(event) => {
            void submit(event.currentTarget, { replace: true });
          }}
        >
          {hasViewParam ? <input type="hidden" name="view" value={view} /> : null}
          {filters.sprintId ? <input type="hidden" name="sprintId" value={filters.sprintId} /> : null}
          <Select
            size="sm"
            name="statusId"
            aria-label={t("project_tasks.filter_status")}
            defaultValue={filters.statusId ?? ""}
            placeholder={t("project_tasks.all_statuses")}
            options={statuses.map((status) => ({ value: status.id, label: status.name }))}
            className="w-[160px]"
            data-testid="filter-status-select"
          />
          <Select
            size="sm"
            name="assigneeId"
            aria-label={t("project_tasks.filter_assignee")}
            defaultValue={filters.assigneeId ?? ""}
            placeholder={t("project_tasks.all_assignees")}
            options={members.map((member) => ({ value: member.id, label: member.fullName }))}
            className="w-[180px]"
            data-testid="filter-assignee-select"
          />
          <Select
            size="sm"
            name="priority"
            aria-label={t("project_tasks.filter_priority")}
            defaultValue={filters.priority ?? ""}
            placeholder={t("project_tasks.all_priorities")}
            options={[...TASK_PRIORITIES].reverse().map((priority) => ({
              value: priority,
              label: translatePriority(t, priority),
            }))}
            className="w-[150px]"
            data-testid="filter-priority-select"
          />
          {hasOtherFilters || filters.sprintId ? (
            <Link
              to={`/projects/${projectId}${hasViewParam ? `?view=${view}` : ""}`}
              className={buttonClass("ghost", "sm")}
              data-testid="reset-filters-link"
            >
              <Icon name="x" size={14} />
              {t("project_tasks.btn_reset")}
            </Link>
          ) : null}
        </Form>
      ) : null}

      {actionData?.message && !actionData.success && !actionData.values ? (
        <div className="px-7 pt-3">
          <Banner tone="danger" role="alert" data-testid="action-error">
            {actionData.message}
          </Banner>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {view === "board" ? (
          tasks.items.length ? (
            <BoardView
              tasks={tasks.items}
              statuses={statuses}
              hrefFor={hrefFor}
              onMove={moveTask}
              onAdd={canCreate ? openCreate : undefined}
            />
          ) : (
            <div className="flex-1">{emptyState}</div>
          )
        ) : view === "timeline" ? (
          tasks.items.length ? (
            <TimelineView tasks={tasks.items} hrefFor={hrefFor} today={getTodayDateString(new Date())} />
          ) : (
            <div className="flex-1">{emptyState}</div>
          )
        ) : (
          <div className="flex-1 overflow-y-auto">
            <ListView
              data-testid="tasks-table"
              tasks={tasks.items}
              statuses={statuses}
              hrefFor={hrefFor}
              empty={emptyState}
              onAdd={canCreate ? openCreate : undefined}
              addLabel={(name) => t("project_tasks.add_to", { name })}
            />
          </div>
        )}
      </div>

      {tasks.totalPages > 1 ? (
        <div
          className="flex shrink-0 items-center justify-between border-t border-line px-7 py-2.5"
          data-testid="pagination-bar"
        >
          <span className="text-[12px] leading-none text-fg-muted">
            {t("project_tasks.pagination_showing", {
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
                {t("project_tasks.pagination_prev")}
              </Link>
            ) : (
              <Button size="sm" disabled>
                {t("project_tasks.pagination_prev")}
              </Button>
            )}
            <span className="text-[12px] font-medium leading-none text-fg-secondary" data-testid="page-indicator">
              {t("project_tasks.pagination_page", { page: tasks.page, totalPages: tasks.totalPages })}
            </span>
            {tasks.page < tasks.totalPages ? (
              <Link
                to={makePageUrl(tasks.page + 1)}
                className={buttonClass("secondary", "sm")}
                data-testid="next-page-button"
              >
                {t("project_tasks.pagination_next")}
              </Link>
            ) : (
              <Button size="sm" disabled>
                {t("project_tasks.pagination_next")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <Dialog
        open={isDialogOpen}
        onClose={closeCreate}
        title={t("project_tasks.modal_title")}
        width={520}
        data-testid="create-task-dialog"
        footer={
          <>
            <Button size="sm" onClick={closeCreate}>
              {t("project_tasks.btn_cancel")}
            </Button>
            <Button
              type="submit"
              form="create-task-form"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              data-testid="task-submit-button"
            >
              {isSubmitting ? t("project_tasks.btn_submitting") : t("project_tasks.btn_submit")}
            </Button>
          </>
        }
      >
        <Form id="create-task-form" method="post" className="flex flex-col gap-3.5">
          <input type="hidden" name="intent" value="createTask" />
          <Input
            id="task-title"
            name="title"
            required
            label={t("project_tasks.modal_task_title")}
            placeholder={t("project_tasks.placeholder_title")}
            defaultValue={actionData?.values?.title ?? ""}
            error={actionData?.errors?.title?.join(", ")}
            autoFocus
            data-testid="task-title-input"
          />
          <Textarea
            id="task-desc"
            name="description"
            rows={3}
            label={t("project_tasks.modal_description")}
            placeholder={t("project_tasks.placeholder_description")}
            defaultValue={actionData?.values?.description ?? ""}
            error={actionData?.errors?.description?.join(", ")}
            data-testid="task-description-input"
          />
          <div className="grid grid-cols-3 gap-3.5">
            <Select
              id="task-priority"
              name="priority"
              label={t("project_tasks.modal_priority")}
              defaultValue={actionData?.values?.priority ?? "MEDIUM"}
              options={[...TASK_PRIORITIES].reverse().map((priority) => ({
                value: priority,
                label: translatePriority(t, priority),
              }))}
              data-testid="task-priority-select"
            />
            <Input
              id="task-start"
              type="date"
              name="startDate"
              label={t("project_tasks.modal_start_date")}
              defaultValue={actionData?.values?.startDate ?? ""}
              error={actionData?.errors?.startDate?.join(", ")}
              data-testid="task-start-date-input"
            />
            <Input
              id="task-due"
              type="date"
              name="dueDate"
              label={t("project_tasks.modal_due_date")}
              defaultValue={actionData?.values?.dueDate ?? ""}
              error={actionData?.errors?.dueDate?.join(", ")}
              data-testid="task-due-date-input"
            />
          </div>
          {canAssign && members.length > 0 ? (
            <Field label={t("project_tasks.modal_assignees")}>
              <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-md border border-line-default p-2.5">
                {members.map((member) => (
                  <Checkbox
                    key={member.id}
                    name="assigneeIds"
                    value={member.id}
                    label={member.fullName}
                    description={member.email}
                  />
                ))}
              </div>
            </Field>
          ) : null}
        </Form>
      </Dialog>

      <Toast text={moveError} id={moveFetcher.data} />
    </div>
  );
}
