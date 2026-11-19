import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSubmit } from "react-router";

import type { CalendarEvent } from "@pm/domain";
import { APP_NAME, CalendarQuerySchema, getCalendarNavDates, getTodayDateString } from "@pm/domain";

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

function formatDateHeading(
  view: "day" | "week" | "month",
  dateStr: string,
  range: { from: string; to: string },
  lng: string,
) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const locale = lng === "vi" ? "vi-VN" : "en-US";

  if (view === "day") {
    return utcDate.toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  if (view === "week") {
    const [fy, fm, fd] = range.from.split("-").map(Number);
    const [ty, tm, td] = range.to.split("-").map(Number);
    const fromDate = new Date(Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1));
    const toDate = new Date(Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1));
    const fromStr = fromDate.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
    const toStr = toDate.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${fromStr} – ${toStr}`;
  }

  return utcDate.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function getDaysBetween(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  let cur = new Date(Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1));
  const end = new Date(Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1));

  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cur = new Date(cur.getTime() + 86400000);
  }
  return days;
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { view, date, range, events, projects, selectedProjectId, navDates, todayStr } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const projectParam = selectedProjectId ? `&projectId=${selectedProjectId}` : "";
  const heading = formatDateHeading(view, date, range, i18n.language);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" data-testid="calendar-page">
      {/* Page Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("calendar.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("calendar.subtitle")}</p>
        </div>

        {/* View Switcher (FR-35 c3) */}
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 shadow-2xs"
          data-testid="calendar-view-toggle"
        >
          <Link
            to={`/calendar?view=day&date=${date}${projectParam}`}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === "day" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("calendar.view_day")}
          </Link>
          <Link
            to={`/calendar?view=week&date=${date}${projectParam}`}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === "week" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("calendar.view_week")}
          </Link>
          <Link
            to={`/calendar?view=month&date=${date}${projectParam}`}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              view === "month" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("calendar.view_month")}
          </Link>
        </div>
      </div>

      {/* Toolbar: Navigation, Heading, and Project Filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
        {/* Navigation Controls (FR-35 c3) */}
        <div className="flex items-center gap-2" data-testid="calendar-nav">
          <Link
            to={`/calendar?view=${view}&date=${navDates.prev}${projectParam}`}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            title={t("calendar.btn_previous")}
            aria-label={t("calendar.btn_previous")}
          >
            ←
          </Link>
          <Link
            to={`/calendar?view=${view}&date=${todayStr}${projectParam}`}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t("calendar.btn_today")}
          </Link>
          <Link
            to={`/calendar?view=${view}&date=${navDates.next}${projectParam}`}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            title={t("calendar.btn_next")}
            aria-label={t("calendar.btn_next")}
          >
            →
          </Link>
          <h2 className="text-base font-semibold text-gray-900 ml-2" data-testid="calendar-heading">
            {heading}
          </h2>
        </div>

        {/* Project Filter (FR-35 c2) */}
        <div className="flex items-center gap-3" data-testid="calendar-project-filter">
          <label htmlFor="calendar-project-select" className="text-xs font-medium text-gray-500 shrink-0">
            {t("calendar.label_project")}
          </label>
          <Form method="get" className="shrink-0">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <select
              id="calendar-project-select"
              name="projectId"
              value={selectedProjectId ?? ""}
              onChange={(e) => {
                void submit(e.currentTarget.form);
              }}
              className="block rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t("calendar.all_projects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </Form>
        </div>
      </div>

      {/* Main Calendar View Area */}
      {view === "day" && <DayView date={date} events={events} />}
      {view === "week" && <WeekView range={range} events={events} todayStr={todayStr} />}
      {view === "month" && <MonthView range={range} events={events} todayStr={todayStr} />}
    </div>
  );
}

function DayView({ date, events }: { date: string; events: CalendarEvent[] }) {
  const { t } = useTranslation();
  const dayEvents = events.filter((e) =>
    e.isSpan && e.startDate ? e.startDate <= date && e.dueDate >= date : e.dueDate === date,
  );

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-4"
      data-testid="calendar-day-view"
    >
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          {t("calendar.day_scheduled_items", { count: dayEvents.length })}
        </h3>
        <span className="text-xs text-gray-500">{date}</span>
      </div>

      {dayEvents.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-8 text-center">{t("calendar.day_empty")}</p>
      ) : (
        <div className="divide-y divide-gray-100 space-y-3">
          {dayEvents.map((event) => (
            <div key={event.id} className="pt-3 first:pt-0 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/projects/${event.projectId}/tasks/${event.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-blue-600 block truncate"
                >
                  {event.projectCode ? `${event.projectCode}-${event.number}: ` : ""}
                  {event.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{event.projectName}</span>
                  {event.isSpan ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                      {t("calendar.span_format", { start: event.startDate, end: event.dueDate })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs text-gray-500">
                      {t("calendar.due_format", { date: event.dueDate })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{event.statusName}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                    event.priority === "URGENT" || event.priority === "HIGH"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-gray-50 text-gray-700 border border-gray-200"
                  }`}
                >
                  {event.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekView({
  range,
  events,
  todayStr,
}: {
  range: { from: string; to: string };
  events: CalendarEvent[];
  todayStr: string;
}) {
  const { t, i18n } = useTranslation();
  const days = getDaysBetween(range.from, range.to);
  const locale = i18n.language === "vi" ? "vi-VN" : "en-US";

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden"
      data-testid="calendar-week-view"
    >
      <div className="grid grid-cols-7 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50 text-center">
        {days.map((dayStr) => {
          const [y, m, d] = dayStr.split("-").map(Number);
          const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
          const dayName = dt.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });
          const isToday = dayStr === todayStr;

          return (
            <div key={dayStr} className={`py-3 px-2 ${isToday ? "bg-blue-50/80" : ""}`}>
              <div className="text-xs font-medium text-gray-500 uppercase">{dayName}</div>
              <div
                className={`mt-1 text-sm font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                  isToday ? "bg-blue-600 text-white" : "text-gray-900"
                }`}
              >
                {d}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-7 divide-x divide-gray-200 min-h-[360px]">
        {days.map((dayStr) => {
          const matching = events.filter((e) =>
            e.isSpan && e.startDate ? e.startDate <= dayStr && e.dueDate >= dayStr : e.dueDate === dayStr,
          );

          return (
            <div key={dayStr} className="p-2 space-y-1.5 flex flex-col">
              {matching.map((e) => (
                <Link
                  key={e.id}
                  to={`/projects/${e.projectId}/tasks/${e.id}`}
                  className={`block p-1.5 rounded text-xs transition-colors border ${
                    e.isSpan
                      ? "bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100"
                      : "bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100"
                  }`}
                  title={`${e.title} (${e.isSpan ? `${e.startDate} → ${e.dueDate}` : `Due ${e.dueDate}`})`}
                >
                  <div className="font-semibold truncate">
                    {e.projectCode}-{e.number}
                  </div>
                  <div className="truncate">{e.title}</div>
                  {e.isSpan && (
                    <div className="text-[10px] text-purple-700 font-medium">{t("calendar.span_badge")}</div>
                  )}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  range,
  events,
  todayStr,
}: {
  range: { from: string; to: string };
  events: CalendarEvent[];
  todayStr: string;
}) {
  const { t, i18n } = useTranslation();
  const days = getDaysBetween(range.from, range.to);

  // Determine starting weekday offset for the first day of the month (Monday = 0, Sunday = 6)
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const firstDate = new Date(Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1));
  const firstDayOfWeek = firstDate.getUTCDay(); // 0 is Sun, 1 is Mon...
  const leadingBlankCount = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const weekdays =
    i18n.language === "vi"
      ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden"
      data-testid="calendar-month-view"
    >
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center">
        {weekdays.map((wd) => (
          <div key={wd} className="py-2.5 text-xs font-semibold text-gray-500 uppercase">
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-collapse divide-x divide-y divide-gray-200 min-h-[480px]">
        {/* Leading empty cells */}
        {Array.from({ length: leadingBlankCount }).map((_, i) => (
          <div key={`blank-${i}`} className="bg-gray-50/50 p-2 min-h-[100px]" />
        ))}

        {/* Days of the month */}
        {days.map((dayStr) => {
          const [, , d] = dayStr.split("-").map(Number);
          const isToday = dayStr === todayStr;
          const matching = events.filter((e) =>
            e.isSpan && e.startDate ? e.startDate <= dayStr && e.dueDate >= dayStr : e.dueDate === dayStr,
          );

          return (
            <div key={dayStr} className={`p-2 min-h-[100px] flex flex-col ${isToday ? "bg-blue-50/30" : ""}`}>
              <div className="flex items-center justify-between pb-1">
                <span
                  className={`text-xs font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                    isToday ? "bg-blue-600 text-white" : "text-gray-700"
                  }`}
                >
                  {d}
                </span>
                {matching.length > 0 && <span className="text-[10px] text-gray-400">{matching.length}</span>}
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[90px]">
                {matching.slice(0, 3).map((e) => (
                  <Link
                    key={e.id}
                    to={`/projects/${e.projectId}/tasks/${e.id}`}
                    className={`block px-1.5 py-0.5 rounded text-[11px] truncate border ${
                      e.isSpan
                        ? "bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100"
                        : "bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100"
                    }`}
                    title={`${e.title} (${e.isSpan ? `${e.startDate} → ${e.dueDate}` : `Due ${e.dueDate}`})`}
                  >
                    <span className="font-semibold mr-1">{e.projectCode}:</span>
                    {e.title}
                  </Link>
                ))}
                {matching.length > 3 && (
                  <span className="text-[10px] text-gray-500 italic block pl-1">
                    {t("calendar.more_tasks", { count: matching.length - 3 })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
