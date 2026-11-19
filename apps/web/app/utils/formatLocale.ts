import { APP_TIMEZONE } from "@pm/domain";

export function getIntlLocale(lng?: string): "vi-VN" | "en-US" {
  return lng === "en" ? "en-US" : "vi-VN";
}

export function formatDateLocale(
  date: string | Date | number,
  lng?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(getIntlLocale(lng), {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(d);
}

export function formatNumberLocale(val: number, lng?: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getIntlLocale(lng), options).format(val);
}

export function formatPercentLocale(val: number, lng?: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getIntlLocale(lng), {
    style: "percent",
    maximumFractionDigits: 1,
    ...options,
  }).format(val);
}
