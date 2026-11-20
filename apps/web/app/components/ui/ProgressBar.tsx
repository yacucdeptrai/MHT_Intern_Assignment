import type { ReactNode } from "react";

import { cx } from "./cx";

export interface ProgressBarProps {
  /** Percentage (0–100), or a count when `total` is set */
  value: number;
  total?: number;
  tone?: "accent" | "done" | "warning" | "danger";
  label?: ReactNode;
  showValue?: boolean;
  height?: number;
  className?: string;
  "data-testid"?: string;
}

const FILL = { accent: "bg-accent", done: "bg-status-done", warning: "bg-warning", danger: "bg-danger" } as const;

/** Thin rounded bar with an optional % value and trailing label. */
export function ProgressBar({
  value,
  total,
  tone = "accent",
  label,
  showValue = true,
  height = 4,
  className,
  "data-testid": testId,
}: ProgressBarProps) {
  const pct = total ? Math.round((value / total) * 100) : Math.round(value);
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className={cx("flex min-w-0 items-center gap-2.5", className)} data-testid={testId}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="min-w-10 flex-1 overflow-hidden rounded-full bg-muted"
        style={{ height }}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-out", FILL[tone])}
          style={{ width: `${String(clamped)}%` }}
        />
      </div>
      {showValue ? (
        <span className="min-w-8 text-right text-[12px] font-medium leading-none text-fg-secondary tabular-nums">{`${String(pct)}%`}</span>
      ) : null}
      {label ? <span className="whitespace-nowrap text-[12px] leading-none text-fg-muted">{label}</span> : null}
    </div>
  );
}
