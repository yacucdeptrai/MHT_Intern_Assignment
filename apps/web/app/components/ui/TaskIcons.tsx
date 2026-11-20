import type { StatusCategory, TaskPriority } from "@pm/domain";
import { useTranslation } from "react-i18next";

import { translateCategory, translatePriority, translateStatusGlyph } from "../../i18n/labels";
import { Badge, type BadgeTone } from "./Badge";
import { Icon, type IconName } from "./Icon";

/** Glyph shown for a status: the category, or an override for Pending / Re-open / Cancelled. */
export type StatusGlyph = StatusCategory | "PENDING" | "REOPEN" | "CANCELLED";

export const STATUS_META: Record<StatusGlyph, { icon: IconName; color: string; tone: BadgeTone }> = {
  TODO: { icon: "circle-dashed", color: "var(--status-todo)", tone: "todo" },
  IN_PROGRESS: { icon: "circle-dot", color: "var(--status-progress)", tone: "progress" },
  REVIEW: { icon: "circle-dot-dashed", color: "var(--status-review)", tone: "review" },
  DONE: { icon: "circle-check", color: "var(--status-done)", tone: "done" },
  PENDING: { icon: "circle-pause", color: "var(--status-progress)", tone: "warning" },
  REOPEN: { icon: "rotate-ccw", color: "var(--danger)", tone: "danger" },
  CANCELLED: { icon: "circle-x", color: "var(--status-cancelled)", tone: "neutral" },
};

/**
 * Admin-configured status names map to one category; the default seed's Pending, Re-open and
 * Cancelled statuses get their own glyphs (docs/guides/status-flow.md).
 */
export function statusGlyph(name: string | null | undefined, category: StatusCategory): StatusGlyph {
  const normalized = (name ?? "").trim().toLowerCase();
  if (category === "IN_PROGRESS" && normalized === "pending") return "PENDING";
  if (category === "IN_PROGRESS" && /^re-?open$/.test(normalized)) return "REOPEN";
  if (category === "DONE" && /^cancel+ed$/.test(normalized)) return "CANCELLED";
  return category;
}

export interface StatusIconProps {
  category: StatusGlyph;
  size?: number;
}

export function StatusIcon({ category, size = 14 }: StatusIconProps) {
  const { t } = useTranslation();
  const meta = STATUS_META[category];
  return (
    <Icon name={meta.icon} size={size} color={meta.color} strokeWidth={2} title={translateStatusGlyph(t, category)} />
  );
}

/** Status name badge colored by its category. */
export function StatusBadge({
  name,
  category,
  size = "md",
  "data-testid": testId,
}: {
  name: string;
  category: StatusCategory;
  size?: "sm" | "md";
  "data-testid"?: string;
}) {
  return (
    <Badge tone={STATUS_META[category].tone} dot size={size} data-testid={testId}>
      {name}
    </Badge>
  );
}

const PRIORITY_META: Record<TaskPriority, { icon: IconName; color: string }> = {
  LOW: { icon: "signal-low", color: "var(--priority-low)" },
  MEDIUM: { icon: "signal-medium", color: "var(--priority-medium)" },
  HIGH: { icon: "signal-high", color: "var(--priority-high)" },
  URGENT: { icon: "octagon-alert", color: "var(--priority-urgent)" },
};

export interface PriorityIconProps {
  priority: TaskPriority;
  size?: number;
  withLabel?: boolean;
}

export function PriorityIcon({ priority, size = 14, withLabel = false }: PriorityIconProps) {
  const { t } = useTranslation();
  const meta = PRIORITY_META[priority];
  const label = translatePriority(t, priority);
  const icon = (
    <Icon name={meta.icon} size={size} color={meta.color} strokeWidth={2} title={withLabel ? undefined : label} />
  );
  if (!withLabel) {
    return icon;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-none text-fg">
      {icon}
      {label}
    </span>
  );
}

export interface DueLabelProps {
  date?: string | null;
  due?: "overdue" | "soon" | null;
  size?: "sm" | "md";
}

/** Due date: red badge when overdue, amber within 48h, otherwise muted text. */
export function DueLabel({ date, due, size = "md" }: DueLabelProps) {
  if (!date) {
    return null;
  }
  if (due === "overdue") {
    return (
      <Badge tone="danger" size={size} icon="clock">
        {date}
      </Badge>
    );
  }
  if (due === "soon") {
    return (
      <Badge tone="warning" size={size} icon="clock">
        {date}
      </Badge>
    );
  }
  return <span className="whitespace-nowrap text-[12px] leading-none text-fg-muted">{date}</span>;
}

/** Category label helper re-exported for column headers and filters. */
export function useCategoryLabel() {
  const { t } = useTranslation();
  return (category: StatusCategory) => translateCategory(t, category);
}
