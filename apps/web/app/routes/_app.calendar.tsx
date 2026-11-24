import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";

import type { CalendarEvent, StatusCategory } from "@pm/domain";
import { APP_NAME, CalendarQuerySchema, getCalendarNavDates, getTodayDateString, STATUS_CATEGORIES } from "@pm/domain";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/cx";
import { IconButton } from "../components/ui/IconButton";
import { Page, Toolbar } from "../components/ui/Page";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { StatusIcon, statusGlyph } from "../components/ui/TaskIcons";
import { ViewSwitcher } from "../components/ui/ViewSwitcher";
import { translateCategory } from "../i18n/labels";

import { calendarService } from "../services/calendar.service";
import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export function meta() {
  return [{ title: `Calendar | ${APP_NAME}` }];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const user = await requireUser(ctx, request);

  const url = new URL(request.url);
  const rawQuery = {
    view: url.searchParams.get("view") || undefined,
    date: url.searchParams.get("date") || undefined,
    projectId: url.searchParams.get("projectId") || undefined,
  };

  const parsed = CalendarQuerySchema.safeParse(rawQuery);
  const query = parsed.success ? parsed.data : { view: "month" as const };

  const data = await calendarService.getCalendarData(ctx, query);
  const navDates = getCalendarNavDates(data.view, data.date);
  const todayStr = getTodayDateString(ctx.clock.now());

  return {
    ...data,
    navDates,
    todayStr,
    user,
  };
}

const DAY_MS = 86_400_000;

function parseDay(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function toDayString(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Monday on or before the given day (UTC). */
function mondayOf(ms: number): number {
  const dow = new Date(ms).getUTCDay();
  return ms - ((dow + 6) % 7) * DAY_MS;
}

function localeOf(lang: string): string {
  return lang.startsWith("vi") ? "vi-VN" : "en-US";
}

function formatDay(ms: number, lang: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(localeOf(lang), { ...options, timeZone: "UTC" }).format(new Date(ms));
}

interface Placed {
  event: CalendarEvent;
  /** Column index range within the week, inclusive */
  startCol: number;
  endCol: number;
  /** The bar continues from the previous week */
  isContinued: boolean;
}

/** First and last day an event occupies: the span for spans, the due date otherwise. */
function eventDays(event: CalendarEvent): [number, number] {
  const due = parseDay(event.dueDate);
  const start = event.isSpan && event.startDate ? parseDay(event.startDate) : due;
  return [Math.min(start, due), due];
}

/** Packs the week's events into lanes so overlapping bars stack. */
function weekLanes(events: CalendarEvent[], weekStart: number): Placed[][] {
  const weekEnd = weekStart + 6 * DAY_MS;
  const inWeek = events
    .map((event) => ({ event, days: eventDays(event) }))
    .filter(({ days }) => days[0] <= weekEnd && days[1] >= weekStart)
    .sort((a, b) => a.days[0] - b.days[0] || b.days[1] - a.days[1]);
  const lanes: Placed[][] = [];
  for (const { event, days } of inWeek) {
    const startCol = Math.round((Math.max(days[0], weekStart) - weekStart) / DAY_MS);
    const endCol = Math.round((Math.min(days[1], weekEnd) - weekStart) / DAY_MS);
    let lane = lanes.find((existing) => existing.every((item) => item.endCol < startCol || item.startCol > endCol));
    if (!lane) {
      lane = [];
      lanes.push(lane);
    }
    lane.push({ event, startCol, endCol, isContinued: days[0] < weekStart });
  }
  return lanes;
}

const CATEGORY_BAR: Record<StatusCategory, string> = {
  TODO: "bg-status-todo-bg text-status-todo-text",
  IN_PROGRESS: "bg-status-progress-bg text-status-progress-text",
  REVIEW: "bg-status-review-bg text-status-review-text",
  DONE: "bg-status-done-bg text-status-done-text",
};

const CATEGORY_EDGE: Record<StatusCategory, string> = {
  TODO: "var(--status-todo)",
  IN_PROGRESS: "var(--status-progress)",
  REVIEW: "var(--status-review)",
  DONE: "var(--status-done)",
};

function taskHref(event: CalendarEvent): string {
  return `/projects/${event.projectId}/tasks/${event.id}`;
}

interface WeekRowProps {
  weekStart: number;
  events: CalendarEvent[];
  maxLanes: number;
  minHeight: number;
  todayStr: string;
  /** Month being shown; days outside it are dimmed */
  monthIndex?: number;
  showDates?: boolean;
}

function WeekRow({ weekStart, events, maxLanes, minHeight, todayStr, monthIndex, showDates = true }: WeekRowProps) {
  const { t, i18n } = useTranslation();
  const lanes = weekLanes(events, weekStart);
  const shown = lanes.slice(0, maxLanes);
  const hidden = lanes.slice(maxLanes).reduce((count, lane) => count + lane.length, 0);
  return (
    <div
      className="relative grid grid-cols-7 border-b border-line last:border-b-0"
      style={{ minHeight }}
      data-testid="calendar-week-row"
    >
      {Array.from({ length: 7 }, (_, index) => {
        const day = weekStart + index * DAY_MS;
        const date = new Date(day);
        const isToday = toDayString(day) === todayStr;
        const isOutside = monthIndex != null && date.getUTCMonth() !== monthIndex;
        return (
          <div
            key={day}
            className={cx("px-2 py-1.5", index < 6 && "border-r border-line", index > 4 && "bg-subtle")}
            data-testid={`calendar-day-${toDayString(day)}`}
          >
            {showDates ? (
              <span
                className={cx(
                  "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-[5px] text-[12px] leading-none",
                  isToday
                    ? "bg-accent font-semibold text-fg-on-accent"
                    : cx("font-medium", isOutside ? "text-fg-faint" : "text-fg-secondary"),
                )}
              >
                {date.getUTCDate() === 1
                  ? formatDay(day, i18n.language, { month: "short", day: "numeric" })
                  : date.getUTCDate()}
              </span>
            ) : null}
          </div>
        );
      })}
      <div
        className="pointer-events-none absolute inset-x-0 flex flex-col gap-[3px]"
        style={{ top: showDates ? 32 : 8 }}
      >
        {shown.map((lane, laneIndex) => (
          <div key={laneIndex} className="relative h-[22px]">
            {lane.map(({ event, startCol, endCol, isContinued }) => (
              <Link
                key={event.id}
                to={taskHref(event)}
                title={`${event.projectCode}-${String(event.number)} · ${event.title}`}
                data-testid={`calendar-event-${event.id}`}
                className={cx(
                  "pointer-events-auto absolute flex h-[22px] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-sm px-[7px] text-[11.5px] font-medium leading-none no-underline hover:no-underline",
                  CATEGORY_BAR[event.statusCategory],
                )}
                style={{
                  left: `calc(${String((startCol / 7) * 100)}% + 4px)`,
                  width: `calc(${String(((endCol - startCol + 1) / 7) * 100)}% - 8px)`,
                  boxShadow: isContinued ? "none" : `inset 2px 0 0 ${CATEGORY_EDGE[event.statusCategory]}`,
                }}
              >
                <span className="font-mono text-[10.5px] font-medium opacity-75">{`${event.projectCode}-${String(event.number)}`}</span>
                <span className="truncate">{event.title}</span>
              </Link>
            ))}
          </div>
        ))}
        {hidden ? (
          <span className="px-2 text-[11px] font-medium leading-none text-fg-muted">
            {t("calendar.more_tasks", { count: hidden })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DayView({ date, events }: { date: string; events: CalendarEvent[] }) {
  const { t, i18n } = useTranslation();
  const day = parseDay(date);
  const items = events.filter((event) => {
    const [start, end] = eventDays(event);
    return start <= day && end >= day;
  });
  return (
    <div className="flex flex-col gap-2 p-4" data-testid="calendar-day-view">
      <span className="mb-1 text-[13px] font-semibold leading-none text-fg">
        {t("calendar.day_scheduled_items", { count: items.length })}
      </span>
      {items.length === 0 ? (
        <span className="text-[13px] leading-[1.4] text-fg-muted">{t("calendar.day_empty")}</span>
      ) : (
        items.map((event) => {
          const [start, end] = eventDays(event);
          return (
            <Link
              key={event.id}
              to={taskHref(event)}
              data-testid={`calendar-event-${event.id}`}
              className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 no-underline hover:bg-hover hover:no-underline"
              style={{ boxShadow: `inset 3px 0 0 ${CATEGORY_EDGE[event.statusCategory]}` }}
            >
              <StatusIcon category={statusGlyph(event.statusName, event.statusCategory)} />
              <span className="w-[62px] truncate font-mono text-[12px] font-medium leading-none text-fg-muted">
                {`${event.projectCode}-${String(event.number)}`}
              </span>
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.3] text-fg">{event.title}</span>
              {event.dueDate === date ? (
                <Badge tone="warning" size="sm">
                  {t("calendar.due_today_badge")}
                </Badge>
              ) : (
                <Badge tone="outline" size="sm">
                  {t("calendar.span_badge")}
                </Badge>
              )}
              <span className="whitespace-nowrap text-[12px] leading-none text-fg-muted">
                {t("calendar.span_format", {
                  start: formatDay(start, i18n.language, { month: "short", day: "numeric" }),
                  end: formatDay(end, i18n.language, { month: "short", day: "numeric" }),
                })}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { view, date, events, projects, selectedProjectId, navDates, todayStr } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const lang = i18n.language;

  const urlFor = (next: { view?: string; date?: string; projectId?: string | null }) => {
    const params = new URLSearchParams();
    params.set("view", next.view ?? view);
    params.set("date", next.date ?? date);
    const projectId = next.projectId === undefined ? selectedProjectId : next.projectId;
    if (projectId) {
      params.set("projectId", projectId);
    }
    return `/calendar?${params.toString()}`;
  };

  const anchor = parseDay(date);
  const anchorDate = new Date(anchor);
  const weekStart = mondayOf(anchor);
  const dayNames = Array.from({ length: 7 }, (_, index) =>
    formatDay(Date.UTC(2024, 0, 1 + index), lang, { weekday: "short" }),
  );

  let title: string;
  let body: ReactNode;
  if (view === "month") {
    const first = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1);
    const gridStart = mondayOf(first);
    title = formatDay(anchor, lang, { month: "short", year: "numeric" });
    body = (
      <div data-testid="calendar-month-view">
        {Array.from({ length: 6 }, (_, week) => (
          <WeekRow
            key={week}
            weekStart={gridStart + week * 7 * DAY_MS}
            events={events}
            maxLanes={3}
            minHeight={118}
            todayStr={todayStr}
            monthIndex={anchorDate.getUTCMonth()}
          />
        ))}
      </div>
    );
  } else if (view === "week") {
    title = `${formatDay(weekStart, lang, { month: "short", day: "numeric" })} – ${formatDay(weekStart + 6 * DAY_MS, lang, { month: "short", day: "numeric" })}`;
    body = (
      <div data-testid="calendar-week-view">
        <WeekRow
          weekStart={weekStart}
          events={events}
          maxLanes={14}
          minHeight={420}
          todayStr={todayStr}
          showDates={false}
        />
      </div>
    );
  } else {
    title = formatDay(anchor, lang, { weekday: "short", month: "short", day: "numeric" });
    body = <DayView date={date} events={events} />;
  }

  return (
    <div data-testid="calendar-page" className="flex min-h-full flex-col">
      <Page maxWidth={1240} header={<PageHeader title={t("calendar.title")} description={t("calendar.subtitle")} />}>
        <Toolbar>
          <span
            className="min-w-[150px] text-[16px] font-semibold leading-none tracking-[-0.015em] text-fg"
            data-testid="calendar-heading"
          >
            {title}
          </span>
          <div className="flex items-center gap-2" data-testid="calendar-nav">
            <IconButton
              icon="chevron-left"
              label={t("calendar.btn_previous")}
              variant="outline"
              onClick={() => {
                void navigate(urlFor({ date: navDates.prev }));
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                void navigate(urlFor({ date: todayStr }));
              }}
            >
              {t("calendar.btn_today")}
            </Button>
            <IconButton
              icon="chevron-right"
              label={t("calendar.btn_next")}
              variant="outline"
              onClick={() => {
                void navigate(urlFor({ date: navDates.next }));
              }}
            />
          </div>
          <span className="flex-1" />
          <div data-testid="calendar-project-filter">
            <Select
              size="sm"
              aria-label={t("calendar.label_project")}
              value={selectedProjectId ?? ""}
              onChange={(event) => {
                void navigate(urlFor({ projectId: event.target.value || null }));
              }}
              placeholder={t("calendar.all_projects")}
              options={projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))}
              className="w-[200px]"
            />
          </div>
          <div data-testid="calendar-view-toggle">
            <ViewSwitcher<CalendarViewId>
              label={t("calendar.title")}
              value={view}
              onChange={(next) => {
                void navigate(urlFor({ view: next }));
              }}
              views={[
                { id: "day", label: t("calendar.view_day"), "data-testid": "calendar-view-day" },
                { id: "week", label: t("calendar.view_week"), "data-testid": "calendar-view-week" },
                { id: "month", label: t("calendar.view_month"), "data-testid": "calendar-view-month" },
              ]}
            />
          </div>
        </Toolbar>

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {view !== "day" ? (
            <div className="grid grid-cols-7 border-b border-line">
              {dayNames.map((name, index) => (
                <div
                  key={name}
                  className={cx(
                    "px-2.5 py-2 text-[11.5px] font-medium leading-none text-fg-muted",
                    index < 6 && "border-r border-line",
                  )}
                >
                  {view === "week" ? `${name} ${String(new Date(weekStart + index * DAY_MS).getUTCDate())}` : name}
                </div>
              ))}
            </div>
          ) : null}
          {body}
        </div>

        <div className="flex gap-3.5 text-[12px] leading-none text-fg-muted" data-testid="calendar-legend">
          {STATUS_CATEGORIES.map((category) => (
            <span key={category} className="inline-flex items-center gap-1.5">
              <span
                className={cx("size-2.5 rounded-[3px]", CATEGORY_BAR[category])}
                style={{ boxShadow: `inset 2px 0 0 ${CATEGORY_EDGE[category]}` }}
              />
              {translateCategory(t, category)}
            </span>
          ))}
        </div>
      </Page>
    </div>
  );
}

type CalendarViewId = "day" | "week" | "month";
