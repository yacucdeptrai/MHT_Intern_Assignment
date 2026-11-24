function localeOf(lang: string): string {
  return lang.startsWith("vi") ? "vi-VN" : "en-US";
}

/**
 * Short month + day ("Nov 21"), the date style used across the design system.
 * Formatted in UTC so server and client render the same string.
 */
export function formatShortDate(value: string | Date, lang: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeOf(lang), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Relative time for activity ("12m ago", "Yesterday"); older than a week falls back to "Nov 21".
 * Depends on the current time, so render it with suppressHydrationWarning.
 */
export function formatRelativeTime(value: string | Date, lang: string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: "auto", style: "narrow" });
  const abs = Math.abs(seconds);
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  if (abs < 60) return capitalize(formatter.format(0, "second"));
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return capitalize(formatter.format(Math.round(seconds / 86400), "day"));
  return new Intl.DateTimeFormat(localeOf(lang), { month: "short", day: "numeric" }).format(date);
}
