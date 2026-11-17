import { APP_TIMEZONE, DUE_SOON_WINDOW_MS } from "./constants";

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
