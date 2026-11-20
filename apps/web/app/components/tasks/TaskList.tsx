import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { StatusCategory, StatusOption, TaskListItem } from "@pm/domain";

import { formatShortDate } from "../../utils/format";
import { AvatarStack } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { DueLabel, PriorityIcon, StatusIcon, statusGlyph, type StatusGlyph } from "../ui/TaskIcons";

export interface GroupHeaderProps {
  glyph?: StatusGlyph;
  label: ReactNode;
  count?: number;
  /** Shown as a + button when the user can add tasks */
  onAdd?: () => void;
  addLabel?: string;
  sticky?: boolean;
  "data-testid"?: string;
}

/** 34px status group header: glyph, name, count, optional add button. */
export function GroupHeader({
  glyph,
  label,
  count,
  onAdd,
  addLabel,
  sticky = false,
  "data-testid": testId,
}: GroupHeaderProps) {
  return (
    <div
      data-testid={testId}
      className={cx(
        "flex h-[34px] items-center gap-2 border-b border-line bg-subtle pl-5 pr-3",
        sticky && "sticky top-0 z-[1]",
      )}
    >
      {glyph ? <StatusIcon category={glyph} /> : null}
      <span className="whitespace-nowrap text-[13px] font-medium leading-none text-fg">{label}</span>
      {count != null ? <span className="text-[12px] leading-none text-fg-muted">{count}</span> : null}
      <span className="flex-1" />
      {onAdd ? <IconButton icon="plus" label={addLabel ?? ""} size="xs" onClick={onAdd} /> : null}
    </div>
  );
}

export function taskKeyOf(task: { projectCode?: string | null; number: number }): string {
  return task.projectCode ? `${task.projectCode}-${String(task.number)}` : `#${String(task.number)}`;
}

export interface TaskRowProps {
  task: TaskListItem;
  href: string;
  selected?: boolean;
  /** Sub-task progress, when known */
  subtasks?: { done: number; total: number };
  "data-testid"?: string;
}

/**
 * 36px task row: priority, key, status glyph, title, sub-tasks, sprint, due, assignees.
 * Sub-tasks and sprint hide below 560px, the due flag below 380px (container width).
 */
export function TaskRow({ task, href, selected = false, subtasks, "data-testid": testId }: TaskRowProps) {
  const { i18n } = useTranslation();
  const category: StatusCategory = task.statusCategory;
  const assigneeNames = task.assignees.map((assignee) => assignee.fullName);
  return (
    <Link
      to={href}
      role="row"
      data-testid={testId}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex h-[var(--row-height)] cursor-pointer items-center gap-2.5 border-b border-line pl-5 pr-4 no-underline hover:no-underline",
        "transition-[background-color] duration-[var(--duration-instant)] ease-out",
        selected ? "bg-selected shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-hover",
      )}
    >
      <PriorityIcon priority={task.priority} />
      <span className="w-[62px] shrink-0 truncate font-mono text-[12px] font-medium leading-none text-fg-muted">
        {taskKeyOf(task)}
      </span>
      <StatusIcon category={statusGlyph(task.statusName, category)} />
      <span className="min-w-[120px] flex-1 truncate text-[13px] font-medium leading-[1.2] text-fg">{task.title}</span>
      {subtasks && subtasks.total > 0 ? (
        <span className="inline-flex items-center gap-1 text-[12px] leading-none text-fg-muted @max-[560px]:hidden">
          <Icon name="list-tree" size={13} />
          {`${String(subtasks.done)}/${String(subtasks.total)}`}
        </span>
      ) : null}
      {task.sprintName ? (
        <Badge tone="outline" size="sm" className="@max-[560px]:hidden">
          {task.sprintName}
        </Badge>
      ) : null}
      <span className="@max-[380px]:hidden">
        <DueLabel
          date={task.dueDate ? formatShortDate(task.dueDate, i18n.language) : null}
          due={task.isOverdue ? "overdue" : task.isDueSoon ? "soon" : null}
          size="sm"
        />
      </span>
      <span className="flex w-[52px] justify-end">
        {assigneeNames.length ? (
          <AvatarStack names={assigneeNames} size={20} max={2} />
        ) : (
          <Icon name="user" size={14} className="text-fg-faint" />
        )}
      </span>
    </Link>
  );
}

export interface ListViewProps {
  tasks: TaskListItem[];
  /** Statuses in display order; tasks are grouped by status */
  statuses: Array<Pick<StatusOption, "id" | "name" | "category">>;
  hrefFor: (task: TaskListItem) => string;
  selectedId?: string | null;
  /** Shown when there are no tasks */
  empty: ReactNode;
  onAdd?: (statusId: string) => void;
  addLabel?: (statusName: string) => string;
  subtasksFor?: (task: TaskListItem) => { done: number; total: number } | undefined;
  "data-testid"?: string;
}

/** Tasks grouped by status (status order), each group with a sticky header. */
export function ListView({
  tasks,
  statuses,
  hrefFor,
  selectedId,
  empty,
  onAdd,
  addLabel,
  subtasksFor,
  "data-testid": testId,
}: ListViewProps) {
  if (tasks.length === 0) {
    return <>{empty}</>;
  }
  const known = new Set(statuses.map((status) => status.id));
  // Tasks whose status is missing from the list (e.g. a deleted status) still render, last.
  const orphanStatuses = tasks
    .filter((task) => !known.has(task.statusId))
    .reduce<Array<Pick<StatusOption, "id" | "name" | "category">>>((acc, task) => {
      if (!acc.some((status) => status.id === task.statusId)) {
        acc.push({ id: task.statusId, name: task.statusName, category: task.statusCategory });
      }
      return acc;
    }, []);
  return (
    <div className="@container flex-1" role="grid" data-testid={testId}>
      {[...statuses, ...orphanStatuses].map((status) => {
        const rows = tasks.filter((task) => task.statusId === status.id);
        if (!rows.length) {
          return null;
        }
        return (
          <div key={status.id} role="rowgroup">
            <GroupHeader
              glyph={statusGlyph(status.name, status.category)}
              label={status.name}
              count={rows.length}
              sticky
              onAdd={
                onAdd
                  ? () => {
                      onAdd(status.id);
                    }
                  : undefined
              }
              addLabel={addLabel?.(status.name)}
              data-testid={`group-${status.id}`}
            />
            {rows.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                href={hrefFor(task)}
                selected={selectedId === task.id}
                subtasks={subtasksFor?.(task)}
                data-testid={`task-row-${task.id}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
