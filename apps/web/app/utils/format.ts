/**
 * Short month + day ("Nov 21"), the date style used across the design system.
 * Formatted in UTC so server and client render the same string.
 */
export function formatShortDate(value: string | Date, lang: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(lang.startsWith("vi") ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
