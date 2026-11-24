import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { STATUS_CATEGORIES, type StatusCategory, type StatusOption, type TaskListItem } from "@pm/domain";

import { translateCategory } from "../../i18n/labels";
import { formatShortDate } from "../../utils/format";
import { AvatarStack } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { DueLabel, PriorityIcon, StatusIcon, statusGlyph } from "../ui/TaskIcons";
import { taskKeyOf } from "./TaskList";

type StatusLite = Pick<StatusOption, "id" | "name" | "category">;

export interface TaskCardProps {
  task: TaskListItem;
  href: string;
  selected?: boolean;
  dragging?: boolean;
}

/** Board card: key + assignees, title, priority / due / sprint row. */
export function TaskCard({ task, href, selected = false, dragging = false }: TaskCardProps) {
  const { i18n } = useTranslation();
  const names = task.assignees.map((assignee) => assignee.fullName);
  return (
    <Link
      to={href}
      draggable={false}
      data-testid={`task-card-${task.id}`}
      className={cx(
        "flex cursor-pointer flex-col gap-2 rounded-lg border bg-raised px-3 py-2.5 no-underline hover:no-underline",
        "transition-[border-color] duration-[var(--duration-instant)] ease-out",
        selected
          ? "border-accent-subtle-border shadow-[0_0_0_1px_var(--accent-subtle-border)]"
          : "border-line-default shadow-xs hover:border-line-strong",
        dragging && "rotate-[1.5deg] shadow-lg",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] font-medium leading-none text-fg-muted">{taskKeyOf(task)}</span>
        {names.length ? <AvatarStack names={names} size={18} max={2} /> : null}
      </div>
      <span className="text-[13px] font-medium leading-[1.4] text-fg text-pretty">{task.title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex size-5 items-center justify-center rounded-sm border border-line-default">
          <PriorityIcon priority={task.priority} size={12} />
        </span>
        <DueLabel
          date={task.dueDate ? formatShortDate(task.dueDate, i18n.language) : null}
          due={task.isOverdue ? "overdue" : task.isDueSoon ? "soon" : null}
          size="sm"
        />
        {task.sprintName ? (
          <Badge tone="outline" size="sm">
            {task.sprintName}
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}

export interface BoardViewProps {
  tasks: TaskListItem[];
  statuses: StatusLite[];
  hrefFor: (task: TaskListItem) => string;
  selectedId?: string | null;
  /** Called when a card is dropped on another category; the first status of that category is used */
  onMove?: (task: TaskListItem, statusId: string) => void;
  onAdd?: (statusId: string) => void;
}

/** Four category columns (To do, In progress, Review, Done), each with its status sub-groups. */
export function BoardView({ tasks, statuses, hrefFor, selectedId, onMove, onAdd }: BoardViewProps) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<StatusCategory | null>(null);

  return (
    <div className="flex flex-1 gap-3 overflow-auto bg-app px-5 pb-16 pt-3" data-testid="board-view">
      {STATUS_CATEGORIES.map((category) => {
        const categoryStatuses = statuses.filter((status) => status.category === category);
        const cards = tasks.filter((task) => task.statusCategory === category);
        const target = categoryStatuses[0]?.id;
        const label = translateCategory(t, category);
        return (
          <div
            key={category}
            data-testid={`board-column-${category}`}
            onDragOver={(event) => {
              if (onMove && target) {
                event.preventDefault();
                setOver(category);
              }
            }}
            onDragLeave={() => {
              setOver(null);
            }}
            onDrop={() => {
              const task = tasks.find((item) => item.id === dragId);
              if (task && target && onMove && task.statusCategory !== category) {
                onMove(task, target);
              }
              setDragId(null);
              setOver(null);
            }}
            className={cx(
              "flex w-[280px] shrink-0 flex-col gap-2 rounded-lg p-1",
              "transition-[background-color] duration-[var(--duration-fast)] ease-out",
              over === category ? "bg-hover" : "bg-transparent",
            )}
          >
            <div className="flex h-[30px] items-center gap-2 px-1.5">
              <StatusIcon category={category} />
              <span className="text-[13px] font-semibold leading-none text-fg">{label}</span>
              <span className="text-[12px] leading-none text-fg-muted">{cards.length}</span>
              <span className="flex-1" />
              {onAdd && target ? (
                <IconButton
                  icon="plus"
                  label={t("project_tasks.add_to", { name: label })}
                  size="xs"
                  onClick={() => {
                    onAdd(target);
                  }}
                />
              ) : null}
            </div>
            {[
              ...categoryStatuses,
              // Tasks whose status is not in the configured list still show, grouped by name.
              ...cards
                .filter((task) => !categoryStatuses.some((status) => status.id === task.statusId))
                .reduce<StatusLite[]>((acc, task) => {
                  if (!acc.some((status) => status.id === task.statusId)) {
                    acc.push({ id: task.statusId, name: task.statusName, category });
                  }
                  return acc;
                }, []),
            ].map((status) => {
              const list = cards.filter((task) => task.statusId === status.id);
              if (!list.length) {
                return null;
              }
              return (
                <Fragment key={status.id}>
                  {categoryStatuses.length > 1 ? (
                    <div className="flex items-center gap-1.5 px-1.5 pt-1.5 text-[11.5px] font-medium leading-none text-fg-muted">
                      <StatusIcon category={statusGlyph(status.name, status.category)} size={12} />
                      {status.name}
                      <span className="font-normal">{list.length}</span>
                    </div>
                  ) : null}
                  {list.map((task) => (
                    <div
                      key={task.id}
                      draggable={Boolean(onMove)}
                      onDragStart={() => {
                        setDragId(task.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                      }}
                      className={dragId === task.id ? "opacity-50" : undefined}
                    >
                      <TaskCard task={task} href={hrefFor(task)} selected={selectedId === task.id} />
                    </div>
                  ))}
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const DAY_MS = 86_400_000;
const TIMELINE_DAYS = 42;
const DAY_WIDTH = 26;
const LEFT_WIDTH = 300;

const BAR_TONE: Record<StatusCategory, string> = {
  TODO: "bg-status-todo-bg text-status-todo-text shadow-[inset_0_0_0_1px_var(--border-strong)]",
  IN_PROGRESS: "bg-status-progress-bg text-status-progress-text shadow-[inset_0_0_0_1px_var(--status-progress)]",
  REVIEW: "bg-status-review-bg text-status-review-text shadow-[inset_0_0_0_1px_var(--status-review)]",
  DONE: "bg-status-done-bg text-status-done-text shadow-[inset_0_0_0_1px_var(--status-done)]",
};

function dayMs(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export interface TimelineViewProps {
  tasks: TaskListItem[];
  hrefFor: (task: TaskListItem) => string;
  selectedId?: string | null;
  /** Today as YYYY-MM-DD (app timezone) */
  today: string;
}

/**
 * Six-week Gantt from the Monday two weeks before today: sticky task column, weekly grid lines,
 * a "Today" marker, and start → due bars colored by status category.
 */
export function TimelineView({ tasks, hrefFor, selectedId, today }: TimelineViewProps) {
  const { t, i18n } = useTranslation();
  const todayMs = dayMs(today);
  const todayDow = new Date(todayMs).getUTCDay();
  const start = todayMs - ((todayDow + 6) % 7) * DAY_MS - 14 * DAY_MS;
  const rows = [...tasks]
    .filter((task) => task.dueDate || task.startDate)
    .sort((a, b) => dayMs(a.startDate ?? a.dueDate ?? today) - dayMs(b.startDate ?? b.dueDate ?? today));
  const unscheduled = tasks.length - rows.length;
  const todayOffset = Math.round((todayMs - start) / DAY_MS);
  const shortDate = (ms: number) => formatShortDate(new Date(ms), i18n.language);

  return (
    <div className="relative flex-1 overflow-auto" data-testid="timeline-view">
      <div className="relative pb-16" style={{ minWidth: LEFT_WIDTH + TIMELINE_DAYS * DAY_WIDTH }}>
        <div className="sticky top-0 z-[2] flex h-[34px] border-b border-line bg-surface">
          <div
            className="sticky left-0 flex shrink-0 items-center border-r border-line bg-surface px-5 text-[12px] font-medium leading-none text-fg-muted"
            style={{ width: LEFT_WIDTH }}
          >
            {t("project_tasks.timeline_task")}
          </div>
          {Array.from({ length: TIMELINE_DAYS / 7 }, (_, week) => (
            <div
              key={week}
              className="flex shrink-0 items-center border-r border-line px-2 text-[12px] font-medium leading-none text-fg-secondary"
              style={{ width: DAY_WIDTH * 7 }}
            >
              {shortDate(start + week * 7 * DAY_MS)}
            </div>
          ))}
        </div>
        {todayOffset >= 0 && todayOffset < TIMELINE_DAYS ? (
          <div
            className="absolute bottom-0 top-0 z-[1] w-px bg-accent"
            style={{ left: LEFT_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
            data-testid="timeline-today"
          >
            <span className="absolute left-[-18px] top-2 w-9 rounded-sm bg-accent text-center text-[10px] font-semibold leading-4 text-fg-on-accent">
              {t("project_tasks.timeline_today")}
            </span>
          </div>
        ) : null}
        {rows.map((task) => {
          const due = dayMs(task.dueDate ?? task.startDate ?? today);
          const begin = Math.min(dayMs(task.startDate ?? task.dueDate ?? today), due);
          const left = Math.max(0, Math.round((begin - start) / DAY_MS));
          const right = Math.min(TIMELINE_DAYS - 1, Math.round((due - start) / DAY_MS));
          const isVisible = right >= 0 && left <= TIMELINE_DAYS - 1 && right >= left;
          const isSelected = selectedId === task.id;
          const firstName = task.assignees[0]?.fullName.split(" ")[0];
          return (
            <Link
              key={task.id}
              to={hrefFor(task)}
              data-testid={`timeline-row-${task.id}`}
              className={cx(
                "flex h-9 cursor-pointer border-b border-line no-underline hover:no-underline",
                isSelected ? "bg-selected" : "bg-transparent hover:bg-hover",
              )}
            >
              <div
                className={cx(
                  "sticky left-0 z-[1] flex shrink-0 items-center gap-2.5 border-r border-line pl-5 pr-4",
                  isSelected ? "bg-selected" : "bg-surface",
                )}
                style={{ width: LEFT_WIDTH }}
              >
                <span className="w-[58px] shrink-0 truncate font-mono text-[12px] font-medium leading-none text-fg-muted">
                  {taskKeyOf(task)}
                </span>
                <StatusIcon category={statusGlyph(task.statusName, task.statusCategory)} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-fg">
                  {task.title}
                </span>
              </div>
              <div
                className="relative flex-1"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${String(DAY_WIDTH * 7 - 1)}px, var(--border-subtle) ${String(DAY_WIDTH * 7 - 1)}px, var(--border-subtle) ${String(DAY_WIDTH * 7)}px)`,
                }}
              >
                {isVisible ? (
                  <div
                    className={cx(
                      "absolute top-[7px] flex h-[22px] items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-[11.5px] font-medium leading-none",
                      BAR_TONE[task.statusCategory],
                    )}
                    style={{ left: left * DAY_WIDTH + 2, width: (right - left + 1) * DAY_WIDTH - 4 }}
                  >
                    {firstName ? `${firstName} · ` : ""}
                    {`${shortDate(begin)} – ${shortDate(due)}`}
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
        {unscheduled > 0 ? (
          <div className="px-5 py-3 text-[12px] leading-none text-fg-muted" data-testid="timeline-unscheduled">
            {t("project_tasks.timeline_unscheduled", { count: unscheduled })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
