import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useSubmit } from "react-router";

import { TASK_PRIORITIES, type StatusOption, type TaskDetailLoaderData } from "@pm/domain";

import { translateCategory, translatePriority } from "../../i18n/labels";
import { extractAuditDiffs, formatAuditTimestamp } from "../../utils/formatAudit";
import { formatShortDate } from "../../utils/format";
import { TaskAttachmentsSection } from "../task/TaskAttachmentsSection";
import { TaskCommentsSection } from "../task/TaskCommentsSection";
import { Avatar, AvatarStack } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { Drawer, PropertyRow } from "../ui/Drawer";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { Input, Textarea } from "../ui/Input";
import { Menu, MenuButton } from "../ui/Menu";
import { ProgressBar } from "../ui/ProgressBar";
import { Select } from "../ui/Select";
import { Tabs } from "../ui/Tabs";
import { Toast } from "../ui/Toast";
import { PriorityIcon, StatusIcon, statusGlyph } from "../ui/TaskIcons";

export interface TaskActionData {
  success?: boolean;
  intent?: string;
  errors?: Record<string, string[]>;
  message?: string;
  values?: Record<string, string>;
}

export interface TaskDrawerProps {
  data: TaskDetailLoaderData;
  actionData?: TaskActionData | undefined;
  isSubmitting: boolean;
  onClose: () => void;
  prevHref?: string | null;
  nextHref?: string | null;
  currentUserName: string;
  /** Docked (≥1200px) or overlaying the list */
  width: string;
}

type ReasonMode = "reject" | "reopen";
type DrawerTab = "details" | "activity" | "files";

const DAY_MS = 86_400_000;

function daysOverdue(dueDate: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(1, Math.round((today - due) / DAY_MS));
}

/** Status button: glyph + name + chevron, opens the list of statuses the user may pick. */
function StatusPicker({
  current,
  statuses,
  canChange,
  onPick,
}: {
  current: { id: string; name: string; category: StatusOption["category"] };
  statuses: StatusOption[];
  canChange: boolean;
  onPick: (statusId: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);
  const label = (
    <>
      <StatusIcon category={statusGlyph(current.name, current.category)} />
      <span data-testid="task-status-badge">{current.name}</span>
      <span className="font-normal text-fg-muted">{translateCategory(t, current.category)}</span>
    </>
  );
  const className =
    "inline-flex h-7 items-center gap-[7px] rounded-md border border-line-default bg-surface pl-[9px] pr-2 text-[12.5px] font-medium leading-none text-fg shadow-xs";
  if (!canChange) {
    return <span className={className}>{label}</span>;
  }
  return (
    <div className="relative">
      <button
        type="button"
        className={`${className} cursor-pointer hover:bg-subtle`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        data-testid="status-picker"
      >
        {label}
        <Icon name="chevron-down" size={13} className="text-fg-muted" />
      </button>
      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-[45]"
            onClick={() => {
              setIsOpen(false);
            }}
          />
          <div className="absolute left-0 top-8 z-[46]">
            <Menu
              width={240}
              onClose={() => {
                setIsOpen(false);
              }}
              items={statuses
                .filter((status) => status.canSelect)
                .map((status) => ({
                  id: status.id,
                  label: status.name,
                  checked: status.id === current.id,
                  disabled: status.id === current.id,
                  onSelect: () => {
                    onPick(status.id);
                  },
                }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Task detail drawer: title, status picker with the one next action, explanatory banners,
 * then Details / Activity / Files. All mutations post to the task route's existing action.
 */
export function TaskDrawer({
  data,
  actionData,
  isSubmitting,
  onClose,
  prevHref,
  nextHref,
  currentUserName,
  width,
}: TaskDrawerProps) {
  const { t, i18n } = useTranslation();
  const submit = useSubmit();
  const { task, subTasks, comments, attachments, history, sprints, members, statuses, permissions } = data;

  const [tab, setTab] = useState<DrawerTab>("details");
  const [isEditing, setIsEditing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [reasonMode, setReasonMode] = useState<ReasonMode | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [prevActionData, setPrevActionData] = useState(actionData);
  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success) {
      setIsEditing(false);
      setIsAssigning(false);
      setIsAddingSubtask(false);
      setReasonMode(null);
    }
  }

  const key = `${task.projectCode}-${String(task.number)}`;
  const shortDate = (value: string | null) => (value ? formatShortDate(value, i18n.language) : null);
  const isConflict =
    Boolean(actionData?.message?.includes("someone else")) ||
    Boolean(actionData?.message?.includes("Reload to see the latest version"));
  const category = task.statusCategory;
  const glyph = statusGlyph(task.statusName, category);
  const selectable = statuses.filter((status) => status.canSelect);
  const firstOf = (wanted: StatusOption["category"], except?: string) =>
    selectable.find(
      (status) =>
        status.category === wanted && status.id !== except && statusGlyph(status.name, status.category) === wanted,
    );

  const changeStatus = (statusId: string) => {
    void submit({ intent: "changeStatus", statusId, version: String(task.version) }, { method: "post" });
  };

  // The single next action for this state.
  let nextAction: React.ReactNode = null;
  if (category === "REVIEW") {
    nextAction = permissions.canApprove ? (
      <>
        <Button
          size="sm"
          onClick={() => {
            setReasonMode("reject");
          }}
          data-testid="reject-task-button"
        >
          {t("task_detail.btn_reject")}
        </Button>
        <Form method="post">
          <input type="hidden" name="intent" value="approve" />
          <input type="hidden" name="version" value={task.version} />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon="check"
            disabled={isSubmitting}
            data-testid="approve-task-button"
          >
            {t("task_detail.btn_approve")}
          </Button>
        </Form>
      </>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] leading-none text-fg-muted">
        <Icon name="clock" size={13} />
        {t("task_detail.waiting_approval")}
      </span>
    );
  } else if (category === "DONE") {
    nextAction = permissions.canReopen ? (
      <Button
        size="sm"
        icon="rotate-ccw"
        onClick={() => {
          setReasonMode("reopen");
        }}
        data-testid="reopen-task-button"
      >
        {t("task_detail.btn_reopen")}
      </Button>
    ) : null;
  } else if (permissions.canEdit) {
    const target =
      category === "TODO"
        ? { status: firstOf("IN_PROGRESS"), label: t("task_detail.btn_start"), icon: undefined }
        : glyph === "PENDING"
          ? { status: firstOf("IN_PROGRESS", task.statusId), label: t("task_detail.btn_resume"), icon: undefined }
          : { status: firstOf("REVIEW"), label: t("task_detail.btn_send_review"), icon: "arrow-up-right" as const };
    nextAction = target.status ? (
      <Button
        size="sm"
        variant={glyph === "PENDING" ? "secondary" : "primary"}
        iconRight={target.icon}
        disabled={isSubmitting}
        onClick={() => {
          if (target.status) changeStatus(target.status.id);
        }}
        data-testid="next-action-button"
      >
        {target.label}
      </Button>
    ) : null;
  }

  const doneSubtasks = subTasks.filter((subTask) => subTask.statusCategory === "DONE").length;
  const activityCount = history.length + comments.reduce((count, thread) => count + 1 + thread.replies.length, 0);
  const tabs = [
    { id: "details", label: t("task_detail.tab_details"), "data-testid": "drawer-tab-details" },
    {
      id: "activity",
      label: t("task_detail.tab_activity"),
      count: activityCount || undefined,
      "data-testid": "drawer-tab-activity",
    },
    {
      id: "files",
      label: t("task_detail.tab_files"),
      count: attachments.length || undefined,
      "data-testid": "drawer-tab-files",
    },
  ];

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setToast({ text: t("task_detail.link_copied"), at: Date.now() });
    });
  };

  const assigneeNames = task.assignees.map((assignee) => assignee.fullName);

  return (
    <Drawer
      width={width}
      onClose={onClose}
      data-testid="task-detail-page"
      toolbar={
        <>
          <span className="flex min-w-0 items-center gap-1 text-[13px] font-medium leading-none">
            <Link
              to={`/projects/${task.projectId}`}
              className="text-fg-muted no-underline hover:text-fg hover:no-underline"
            >
              {task.projectCode}
            </Link>
            <Icon name="chevron-right" size={13} className="text-fg-faint" />
            <span className="font-mono text-[12px] text-fg" data-testid="task-breadcrumb-number">
              {key}
            </span>
          </span>
          <span className="flex-1" />
          {prevHref ? (
            <Link to={prevHref} aria-label={t("task_detail.prev_task")} title={t("task_detail.prev_task")}>
              <IconButton icon="chevron-left" label={t("task_detail.prev_task")} tabIndex={-1} />
            </Link>
          ) : (
            <IconButton icon="chevron-left" label={t("task_detail.prev_task")} disabled />
          )}
          {nextHref ? (
            <Link to={nextHref} aria-label={t("task_detail.next_task")} title={t("task_detail.next_task")}>
              <IconButton icon="chevron-right" label={t("task_detail.next_task")} tabIndex={-1} />
            </Link>
          ) : (
            <IconButton icon="chevron-right" label={t("task_detail.next_task")} disabled />
          )}
          <IconButton icon="link" label={t("task_detail.copy_link")} onClick={copyLink} data-testid="copy-task-link" />
          {permissions.canEdit && category !== "DONE" ? (
            <IconButton
              icon="pencil"
              label={t("task_detail.btn_edit")}
              active={isEditing}
              onClick={() => {
                setTab("details");
                setIsEditing((editing) => !editing);
              }}
              data-testid="edit-task-button"
            />
          ) : null}
          {permissions.canArchive ? (
            <MenuButton
              label={t("task_detail.more")}
              items={[
                {
                  id: "archive",
                  label: t("task_detail.btn_archive"),
                  icon: "archive",
                  danger: true,
                  onSelect: () => {
                    setIsArchiveOpen(true);
                  },
                  "data-testid": "archive-task-button",
                },
              ]}
              data-testid="task-more-menu"
            />
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-3.5 px-6 pt-5">
        {task.parentTaskId ? (
          <Link
            to={`/projects/${task.projectId}/tasks/${task.parentTaskId}`}
            className="inline-flex items-center gap-1.5 text-[12px] leading-none text-fg-muted no-underline hover:text-fg hover:no-underline"
          >
            <Icon name="list-tree" size={13} />
            {t("task_detail.subtask_of", {
              key: `${task.projectCode}-${String(task.parentTaskNumber ?? "")}`,
              title: task.parentTaskTitle ?? "",
            })}
          </Link>
        ) : null}
        <h1
          className="m-0 text-[length:var(--text-xl)] font-semibold leading-[var(--leading-tight)] tracking-[-0.02em] text-fg text-pretty"
          data-testid="task-title"
        >
          {task.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPicker
            current={{ id: task.statusId, name: task.statusName, category }}
            statuses={statuses}
            canChange={permissions.canEdit}
            onPick={changeStatus}
          />
          {task.isOverdue && task.dueDate ? (
            <Badge tone="danger" icon="clock" data-testid="overdue-badge">
              {t("task_detail.badge_overdue", { count: daysOverdue(task.dueDate) })}
            </Badge>
          ) : task.isDueSoon ? (
            <Badge tone="warning" icon="clock" data-testid="due-soon-badge">
              {t("task_detail.badge_due_soon", { date: shortDate(task.dueDate) })}
            </Badge>
          ) : null}
          {task.isTodayPriority ? (
            <Badge tone="accent" icon="flag" data-testid="today-priority-badge">
              {t("task_detail.badge_today_priority")}
            </Badge>
          ) : null}
          <span className="flex-1" />
          {nextAction}
        </div>

        {isConflict ? (
          <Banner
            tone="warning"
            title={t("task_detail.conflict_title")}
            data-testid="conflict-banner"
            action={
              <Button
                size="sm"
                onClick={() => {
                  window.location.reload();
                }}
                data-testid="reload-version-button"
              >
                {t("task_detail.conflict_reload")}
              </Button>
            }
          >
            {t("task_detail.conflict_message")}
          </Banner>
        ) : actionData?.message && !actionData.success && !reasonMode ? (
          <Banner tone="danger" role="alert" data-testid="action-error">
            {actionData.message}
          </Banner>
        ) : null}
        {category === "DONE" ? (
          <Banner tone="success" data-testid="frozen-done-indicator">
            {permissions.canReopen ? t("task_detail.frozen_done_pm") : t("task_detail.frozen_done_member")}
          </Banner>
        ) : null}

        <Tabs
          items={tabs}
          value={tab}
          onChange={(id) => {
            setTab(id === "activity" || id === "files" ? id : "details");
          }}
          label={t("task_detail.tabs_label")}
          className="mt-1"
        />
      </div>

      {/* Values the journeys read directly; the visible UI shows them as icons and labels. */}
      <span className="sr-only" data-testid="sidebar-status">
        {task.statusName}
      </span>
      <span className="sr-only" data-testid="display-task-version">
        {task.version}
      </span>

      {tab === "details" ? (
        <div className="flex flex-col gap-5 px-6 pb-8 pt-4">
          {isEditing ? (
            <Form method="post" className="flex flex-col gap-3.5" data-testid="edit-task-form">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="version" value={task.version} data-testid="input-task-version" />
              <Input
                id="task-title-input"
                name="title"
                required
                maxLength={200}
                label={t("task_detail.label_title")}
                defaultValue={actionData?.values?.title ?? task.title}
                error={
                  actionData?.errors?.title ? (
                    <span data-testid="error-title">{actionData.errors.title.join(", ")}</span>
                  ) : undefined
                }
                data-testid="edit-title-input"
              />
              <Textarea
                id="task-desc-input"
                name="description"
                rows={5}
                maxLength={10000}
                label={t("task_detail.label_description")}
                defaultValue={actionData?.values?.description ?? task.description ?? ""}
                error={
                  actionData?.errors?.description ? (
                    <span data-testid="error-description">{actionData.errors.description.join(", ")}</span>
                  ) : undefined
                }
                data-testid="edit-description-input"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  id="task-priority-select"
                  name="priority"
                  label={t("task_detail.label_priority")}
                  defaultValue={actionData?.values?.priority ?? task.priority}
                  options={[...TASK_PRIORITIES].reverse().map((priority) => ({
                    value: priority,
                    label: translatePriority(t, priority),
                  }))}
                  data-testid="edit-priority-select"
                />
                <Select
                  id="task-sprint-select"
                  name="sprintId"
                  label={t("task_detail.label_sprint")}
                  defaultValue={actionData?.values?.sprintId ?? task.sprintId ?? ""}
                  placeholder={t("task_detail.sprint_backlog")}
                  options={sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))}
                  error={
                    actionData?.errors?.sprintId ? (
                      <span data-testid="error-sprintId">{actionData.errors.sprintId.join(", ")}</span>
                    ) : undefined
                  }
                  data-testid="edit-sprint-select"
                />
                <Input
                  id="task-start-date-input"
                  type="date"
                  name="startDate"
                  label={t("task_detail.label_start_date")}
                  defaultValue={actionData?.values?.startDate ?? task.startDate ?? ""}
                  error={
                    actionData?.errors?.startDate ? (
                      <span data-testid="error-startDate">{actionData.errors.startDate.join(", ")}</span>
                    ) : undefined
                  }
                  data-testid="edit-start-date-input"
                />
                <Input
                  id="task-due-date-input"
                  type="date"
                  name="dueDate"
                  label={t("task_detail.label_due_date")}
                  defaultValue={actionData?.values?.dueDate ?? task.dueDate ?? ""}
                  error={
                    actionData?.errors?.dueDate ? (
                      <span data-testid="error-dueDate">{actionData.errors.dueDate.join(", ")}</span>
                    ) : undefined
                  }
                  data-testid="edit-due-date-input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                  }}
                  data-testid="cancel-edit-button"
                >
                  {t("task_detail.btn_cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={isSubmitting}
                  data-testid="save-task-button"
                >
                  {isSubmitting ? t("task_detail.btn_saving") : t("task_detail.btn_save_changes")}
                </Button>
              </div>
            </Form>
          ) : (
            <>
              <p
                className={`m-0 whitespace-pre-wrap text-[length:var(--text-md)] leading-[var(--leading-relaxed)] ${task.description ? "text-fg" : "text-fg-faint"}`}
                data-testid="task-description"
              >
                {task.description ?? t("task_detail.no_description")}
              </p>
              <div
                className="grid gap-x-6 border-y border-line py-1.5"
                style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}
                data-testid="task-sidebar"
              >
                <PropertyRow label={t("task_detail.label_priority")} data-testid="sidebar-priority">
                  <span data-testid="task-priority-badge" className="inline-flex">
                    <PriorityIcon priority={task.priority} withLabel />
                  </span>
                </PropertyRow>
                <PropertyRow label={t("task_detail.label_sprint")} data-testid="sidebar-sprint">
                  {task.sprintName ?? <span className="text-fg-muted">{t("task_detail.sidebar_backlog")}</span>}
                </PropertyRow>
                <PropertyRow label={t("task_detail.label_start_date")} data-testid="sidebar-start-date">
                  {shortDate(task.startDate) ?? <span className="text-fg-muted">—</span>}
                </PropertyRow>
                <PropertyRow label={t("task_detail.label_due_date")} data-testid="sidebar-due-date">
                  <span className={task.isOverdue ? "text-due-overdue" : undefined}>
                    {shortDate(task.dueDate) ?? "—"}
                  </span>
                </PropertyRow>
                <PropertyRow label={t("task_detail.label_assignees")}>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5" data-testid="sidebar-assignees">
                    {assigneeNames.length ? (
                      <>
                        <AvatarStack names={assigneeNames} size={18} />
                        <span className="truncate">
                          {task.assignees.map((assignee) => (
                            <span
                              key={assignee.id}
                              data-testid={`assignee-pill-${assignee.id}`}
                              className="after:content-[',_'] last:after:content-none"
                            >
                              {assignee.fullName}
                            </span>
                          ))}
                        </span>
                      </>
                    ) : (
                      <span className="text-fg-muted">{t("task_detail.unassigned")}</span>
                    )}
                  </span>
                  {permissions.canAssign ? (
                    <IconButton
                      icon={isAssigning ? "x" : "user-plus"}
                      label={
                        isAssigning ? t("task_detail.btn_cancel_assignees") : t("task_detail.btn_change_assignees")
                      }
                      size="xs"
                      onClick={() => {
                        setIsAssigning((assigning) => !assigning);
                      }}
                      data-testid="btn-toggle-assign"
                    />
                  ) : null}
                </PropertyRow>
                <PropertyRow label={t("task_detail.created_by")}>
                  <Avatar name={task.creatorName} size={18} />
                  <span className="truncate">{task.creatorName}</span>
                </PropertyRow>
              </div>
              {isAssigning ? (
                <Form method="post" className="flex flex-col gap-2" data-testid="form-assign">
                  <input type="hidden" name="intent" value="assign" />
                  <input type="hidden" name="version" value={task.version} />
                  <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-line-default p-2.5">
                    {members.map((member) => (
                      <Checkbox
                        key={member.id}
                        name="assigneeIds"
                        value={member.id}
                        defaultChecked={task.assignees.some((assignee) => assignee.id === member.id)}
                        label={member.fullName}
                        data-testid={`checkbox-assignee-${member.id}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={isSubmitting}
                      data-testid="btn-save-assign"
                    >
                      {t("task_detail.btn_save_assignees")}
                    </Button>
                  </div>
                </Form>
              ) : null}
            </>
          )}

          <div className="flex flex-col gap-1.5" data-testid="subtasks-section">
            <div className="flex h-6 items-center gap-3">
              <span className="text-[13px] font-semibold leading-none text-fg">
                {t("task_detail.heading_subtasks")}
              </span>
              {subTasks.length ? (
                <span className="max-w-[220px] flex-1" data-testid="subtask-progress">
                  <ProgressBar
                    value={doneSubtasks}
                    total={subTasks.length}
                    tone="done"
                    showValue={false}
                    label={t("task_detail.subtasks_done", { done: doneSubtasks, total: subTasks.length })}
                  />
                </span>
              ) : null}
              <span className="flex-1" />
              {!task.parentTaskId && permissions.canEdit && category !== "DONE" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() => {
                    setIsAddingSubtask(true);
                  }}
                  data-testid="add-subtask-button"
                >
                  {t("task_detail.btn_add_subtask")}
                </Button>
              ) : null}
            </div>
            {isAddingSubtask ? (
              <Form
                method="post"
                className="flex flex-col gap-3 rounded-lg border border-line p-3"
                data-testid="form-add-subtask"
              >
                <input type="hidden" name="intent" value="addSubTask" />
                <Input
                  name="title"
                  required
                  maxLength={200}
                  aria-label={t("task_detail.label_title")}
                  placeholder={t("task_detail.placeholder_subtask_title")}
                  error={actionData?.errors?.title?.join(", ")}
                  data-testid="input-subtask-title"
                />
                <Textarea
                  name="description"
                  rows={2}
                  maxLength={10000}
                  aria-label={t("task_detail.label_description")}
                  placeholder={t("task_detail.placeholder_subtask_description")}
                  data-testid="input-subtask-description"
                />
                <div className="grid grid-cols-3 gap-3">
                  <Select
                    id="subtask-priority-select"
                    name="priority"
                    label={t("task_detail.label_priority")}
                    defaultValue="MEDIUM"
                    options={[...TASK_PRIORITIES].reverse().map((priority) => ({
                      value: priority,
                      label: translatePriority(t, priority),
                    }))}
                    data-testid="select-subtask-priority"
                  />
                  <Input
                    id="subtask-start-date-input"
                    type="date"
                    name="startDate"
                    label={t("task_detail.label_start_date")}
                    data-testid="input-subtask-start-date"
                  />
                  <Input
                    id="subtask-due-date-input"
                    type="date"
                    name="dueDate"
                    label={t("task_detail.label_due_date")}
                    data-testid="input-subtask-due-date"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsAddingSubtask(false);
                    }}
                    data-testid="btn-cancel-subtask"
                  >
                    {t("task_detail.btn_cancel")}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={isSubmitting}
                    data-testid="btn-create-subtask"
                  >
                    {t("task_detail.btn_create_subtask")}
                  </Button>
                </div>
              </Form>
            ) : null}
            {subTasks.length === 0 ? (
              <span className="text-[12.5px] leading-[1.4] text-fg-muted">{t("task_detail.no_subtasks")}</span>
            ) : (
              subTasks.map((subTask) => (
                <Link
                  key={subTask.id}
                  to={`/projects/${subTask.projectId}/tasks/${subTask.id}`}
                  className="-mx-2 flex h-8 items-center gap-2.5 rounded-md px-2 no-underline hover:bg-hover hover:no-underline"
                  data-testid="subtask-row"
                >
                  <StatusIcon category={statusGlyph(subTask.statusName, subTask.statusCategory)} />
                  <span className="w-[62px] shrink-0 font-mono text-[12px] font-medium leading-none text-fg-muted">
                    {`${task.projectCode}-${String(subTask.number)}`}
                  </span>
                  <span
                    className={`truncate text-[13px] leading-none ${subTask.statusCategory === "DONE" ? "text-fg-muted line-through" : "text-fg"}`}
                    data-testid="subtask-link"
                  >
                    {subTask.title}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4">
          <div className="flex flex-col gap-3" data-testid="task-history-section">
            {history.length === 0 ? (
              <span className="text-[12.5px] leading-[1.4] text-fg-muted">{t("task_detail.no_history")}</span>
            ) : (
              history.map((entry) => {
                const { reason, diffs } = extractAuditDiffs(entry.changes);
                return (
                  <div
                    key={entry.id}
                    className="flex gap-2 text-[12.5px] leading-[1.45] text-fg-muted"
                    data-testid="task-history-row"
                  >
                    <span className="inline-flex w-5 justify-center pt-0.5">
                      <Icon name="history" size={13} />
                    </span>
                    <span className="flex flex-1 flex-col gap-1">
                      <span>
                        <span className="font-medium text-fg">{entry.actorName}</span>{" "}
                        <span className="font-mono text-[11.5px]">{entry.action}</span>
                        {` · ${formatAuditTimestamp(entry.createdAt)}`}
                      </span>
                      {diffs.map((diff) => (
                        <span key={diff.field} className="font-mono text-[11.5px]">
                          {`${diff.field}: ${diff.fromText} → ${diff.toText}`}
                        </span>
                      ))}
                      {reason ? (
                        <span
                          className="rounded-md bg-subtle px-2.5 py-1.5 text-fg-secondary"
                          data-testid="task-history-reason"
                        >
                          {t("task_detail.history_reason")} {reason}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <TaskCommentsSection
            comments={comments}
            canComment={permissions.canComment}
            isSubmitting={isSubmitting}
            actionData={actionData}
            currentUserName={currentUserName}
          />
        </div>
      ) : null}

      {tab === "files" ? (
        <div className="px-6 pb-8 pt-4">
          <TaskAttachmentsSection
            projectId={task.projectId}
            taskId={task.id}
            attachments={attachments}
            canAttach={permissions.canAttach}
            isSubmitting={isSubmitting}
          />
        </div>
      ) : null}

      <Dialog
        open={reasonMode !== null}
        onClose={() => {
          setReasonMode(null);
        }}
        title={reasonMode === "reject" ? t("task_detail.heading_reject") : t("task_detail.heading_reopen")}
        description={`${key} — ${reasonMode === "reject" ? t("task_detail.reject_desc") : t("task_detail.reopen_desc")}`}
        footer={
          <>
            <Button
              onClick={() => {
                setReasonMode(null);
              }}
              data-testid="cancel-reason-button"
            >
              {t("task_detail.btn_cancel")}
            </Button>
            <Button
              type="submit"
              form="reason-form"
              variant="primary"
              disabled={isSubmitting}
              data-testid="submit-reason-button"
            >
              {reasonMode === "reject" ? t("task_detail.btn_confirm_reject") : t("task_detail.btn_confirm_reopen")}
            </Button>
          </>
        }
      >
        {reasonMode ? (
          <Form id="reason-form" method="post" className="flex flex-col gap-3" data-testid="form-reason-transition">
            <input type="hidden" name="intent" value={reasonMode} />
            <input type="hidden" name="version" value={task.version} />
            {actionData?.message && !actionData.success && !actionData.errors?.reason ? (
              <Banner tone="danger" role="alert">
                {actionData.message}
              </Banner>
            ) : null}
            <Textarea
              id="task-reason-input"
              name="reason"
              rows={3}
              maxLength={2000}
              // Validated by the server (400 with a field error), so the browser does not block empty submits.
              requiredMark
              label={t("task_detail.label_reason")}
              defaultValue={actionData?.values?.reason ?? ""}
              placeholder={
                reasonMode === "reject"
                  ? t("task_detail.placeholder_reason_reject")
                  : t("task_detail.placeholder_reason_reopen")
              }
              error={
                actionData?.errors?.reason ? (
                  <span data-testid="error-reason">{actionData.errors.reason.join(", ")}</span>
                ) : undefined
              }
              data-testid="input-task-reason"
            />
          </Form>
        ) : null}
      </Dialog>

      <Dialog
        open={isArchiveOpen}
        onClose={() => {
          setIsArchiveOpen(false);
        }}
        title={t("task_detail.archive_title", { key })}
        description={t("task_detail.confirm_archive")}
        footer={
          <>
            <Button
              onClick={() => {
                setIsArchiveOpen(false);
              }}
            >
              {t("task_detail.btn_cancel")}
            </Button>
            <Button
              variant="danger"
              icon="archive"
              data-testid="confirm-archive-task-btn"
              onClick={() => {
                void submit({ intent: "archive", version: String(task.version) }, { method: "post" });
                setIsArchiveOpen(false);
              }}
            >
              {t("task_detail.btn_archive")}
            </Button>
          </>
        }
      />

      <Toast text={toast?.text} id={toast?.at} />
    </Drawer>
  );
}
