import { APP_TIMEZONE, DUE_SOON_WINDOW_MS } from "./constants";
import type { CalendarRange, CalendarView } from "./types/calendar";

export interface TaskDateTarget {
  dueDate?: string | null | undefined;
  statusCategory: string;
  deletedAt?: Date | number | null | undefined;
  priority?: string | undefined;
}

/**
 * Calculates end of day epoch ms in APP_TIMEZONE (23:59:59.999+07:00).
 * Asia/Ho_Chi_Minh has no DST and is fixed at UTC+7 (+07:00).
 */
export function getEndOfDayMs(dueDateStr: string): number {
  const parts = dueDateStr.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 7 * 60 * 60 * 1000;
}

export function getStartOfDayMs(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
}

export function getTodayDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(now);
}

/**
 * Task is overdue if:
 * 1. Not archived (deletedAt == null)
 * 2. Status category != "DONE"
 * 3. dueDate is set
 * 4. now > end of due day in APP_TIMEZONE (23:59:59.999)
 */
export function isOverdue(task: TaskDateTarget, now: Date = new Date()): boolean {
  if (task.deletedAt != null) return false;
  if (task.statusCategory === "DONE") return false;
  if (!task.dueDate) return false;

  const endMs = getEndOfDayMs(task.dueDate);
  return now.getTime() > endMs;
}

/**
 * Task is due soon if:
 * 1. Not archived (deletedAt == null)
 * 2. Status category != "DONE"
 * 3. dueDate is set
 * 4. Not overdue (now <= end of due day)
 * 5. now is within DUE_SOON_WINDOW_MS (24h) before end of due day:
 *    endMs - now.getTime() <= DUE_SOON_WINDOW_MS
 */
export function isDueSoon(task: TaskDateTarget, now: Date = new Date()): boolean {
  if (task.deletedAt != null) return false;
  if (task.statusCategory === "DONE") return false;
  if (!task.dueDate) return false;

  const nowMs = now.getTime();
  const endMs = getEndOfDayMs(task.dueDate);
  return nowMs <= endMs && endMs - nowMs <= DUE_SOON_WINDOW_MS;
}

/**
 * Today's priorities:
 * A task that is NOT archived and NOT Done, and:
 * - is overdue, OR
 * - is due today (dueDate matches today's date in APP_TIMEZONE), OR
 * - has priority HIGH or URGENT
 */
export function isTodayPriority(task: TaskDateTarget, now: Date = new Date()): boolean {
  if (task.deletedAt != null) return false;
  if (task.statusCategory === "DONE") return false;

  if (task.priority === "HIGH" || task.priority === "URGENT") {
    return true;
  }

  if (isOverdue(task, now)) {
    return true;
  }

  if (task.dueDate) {
    const todayStr = getTodayDateString(now);
    if (task.dueDate === todayStr) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates calendar days overdue in APP_TIMEZONE.
 * Returns 0 if not overdue (today or in future).
 */
export function calculateDaysOverdue(dueDateStr: string, now: Date = new Date()): number {
  const todayStr = getTodayDateString(now);
  if (dueDateStr >= todayStr) {
    return 0;
  }
  const dueParts = dueDateStr.split("-").map(Number);
  const todayParts = todayStr.split("-").map(Number);
  const dueYear = dueParts[0] ?? 1970;
  const dueMonth = dueParts[1] ?? 1;
  const dueDay = dueParts[2] ?? 1;
  const todayYear = todayParts[0] ?? 1970;
  const todayMonth = todayParts[1] ?? 1;
  const todayDay = todayParts[2] ?? 1;

  const dueUtc = Date.UTC(dueYear, dueMonth - 1, dueDay);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const diffMs = todayUtc - dueUtc;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Calculates start and end calendar dates (inclusive) for a given view and reference date in APP_TIMEZONE.
 * Week starts on Monday (ISO-8601).
 */
export function getCalendarRange(view: CalendarView, dateStr: string): CalendarRange {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  if (view === "day") {
    return { from: dateStr, to: dateStr };
  }

  if (view === "week") {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = d.getUTCDay(); // 0: Sun, 1: Mon, ..., 6: Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d.getTime() + diffToMonday * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    return {
      from: formatUtcDate(monday),
      to: formatUtcDate(sunday),
    };
  }

  // Month view: full calendar month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mStr = String(month).padStart(2, "0");
  return {
    from: `${year}-${mStr}-01`,
    to: `${year}-${mStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Computes the previous and next reference dates for calendar navigation.
 */
export function getCalendarNavDates(view: CalendarView, dateStr: string): { prev: string; next: string } {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  if (view === "day") {
    const d = new Date(Date.UTC(year, month - 1, day));
    const prev = new Date(d.getTime() - 86400000);
    const next = new Date(d.getTime() + 86400000);
    return { prev: formatUtcDate(prev), next: formatUtcDate(next) };
  }

  if (view === "week") {
    const d = new Date(Date.UTC(year, month - 1, day));
    const prev = new Date(d.getTime() - 7 * 86400000);
    const next = new Date(d.getTime() + 7 * 86400000);
    return { prev: formatUtcDate(prev), next: formatUtcDate(next) };
  }

  // Month view: 1st of prev month, 1st of next month
  const prevMonth = new Date(Date.UTC(year, month - 2, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return { prev: formatUtcDate(prevMonth), next: formatUtcDate(nextMonth) };
}
