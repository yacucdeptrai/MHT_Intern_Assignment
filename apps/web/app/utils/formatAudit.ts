import { APP_TIMEZONE } from "@pm/domain";

const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatAuditTimestamp(epochMs: number): string {
  return timestampFormatter.format(new Date(epochMs));
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "none";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map((item) => formatAuditValue(item)).join(", ");
  }
  return JSON.stringify(value);
}

export interface FormattedAuditDiff {
  field: string;
  fromText: string;
  toText: string;
}

export function extractAuditDiffs(changes: Record<string, { from: unknown; to: unknown }> | null): {
  reason: string | null;
  diffs: FormattedAuditDiff[];
} {
  if (!changes) {
    return { reason: null, diffs: [] };
  }

  let reason: string | null = null;
  if (typeof changes.reason?.to === "string" && changes.reason.to.length > 0) {
    reason = changes.reason.to;
  }

  const hasStatusName = Boolean(changes.statusName);
  const diffs: FormattedAuditDiff[] = [];

  for (const [field, pair] of Object.entries(changes)) {
    if (field === "reason" || field === "commentId") {
      continue;
    }
    if (field === "statusId" && hasStatusName) {
      continue;
    }
    diffs.push({
      field,
      fromText: formatAuditValue(pair.from),
      toText: formatAuditValue(pair.to),
    });
  }

  return { reason, diffs };
}
