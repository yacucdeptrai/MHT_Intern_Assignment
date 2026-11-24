import type { ReactNode } from "react";
import { Link } from "react-router";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type StatTone = "neutral" | "danger" | "warning" | "done";

const TONE_CLASS: Record<StatTone, string> = {
  neutral: "text-fg",
  danger: "text-due-overdue",
  warning: "text-due-soon",
  done: "text-status-done-text",
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: StatTone;
  /** Makes the whole card a link */
  to?: string;
  className?: string;
  "data-testid"?: string;
}

/** KPI tile: small label, large tabular number, optional hint. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  to,
  className,
  "data-testid": testId,
}: StatCardProps) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[12px] font-medium leading-none text-fg-muted">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </span>
      <span
        className={cx("text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums", TONE_CLASS[tone])}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </span>
      {hint ? <span className="text-[12px] leading-[1.35] text-fg-muted">{hint}</span> : null}
    </>
  );
  const base = cx(
    "flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3.5 no-underline hover:no-underline",
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cx(base, "cursor-pointer hover:border-line-default")} data-testid={testId}>
        {body}
      </Link>
    );
  }
  return (
    <div className={base} data-testid={testId}>
      {body}
    </div>
  );
}
