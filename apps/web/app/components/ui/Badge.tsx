import type { ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type BadgeTone =
  "neutral" | "outline" | "accent" | "todo" | "progress" | "review" | "done" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, [string, string]> = {
  neutral: ["bg-muted text-fg-secondary", "bg-fg-muted"],
  outline: ["bg-transparent text-fg-secondary", "bg-fg-muted"],
  accent: ["bg-accent-subtle text-accent-text", "bg-accent"],
  todo: ["bg-status-todo-bg text-status-todo-text", "bg-status-todo"],
  progress: ["bg-status-progress-bg text-status-progress-text", "bg-status-progress"],
  review: ["bg-status-review-bg text-status-review-text", "bg-status-review"],
  done: ["bg-status-done-bg text-status-done-text", "bg-status-done"],
  success: ["bg-success-subtle text-success", "bg-success"],
  warning: ["bg-due-soon-bg text-due-soon", "bg-warning"],
  danger: ["bg-due-overdue-bg text-due-overdue", "bg-danger"],
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Leading colored dot in the tone's solid color */
  dot?: boolean;
  icon?: IconName;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

/** Muted label for status, role and flags. Sentence case, never all caps. */
export function Badge({ tone = "neutral", dot = false, icon, size = "md", className, children, ...rest }: BadgeProps) {
  const [toneClass, dotClass] = TONES[tone];
  const isSmall = size === "sm";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-sm border font-medium leading-none",
        isSmall ? "h-[18px] px-1.5 text-[10.5px]" : "h-5 px-[7px] text-[11.5px]",
        tone === "outline" ? "border-line-default" : "border-transparent",
        toneClass,
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cx("size-1.5 shrink-0 rounded-full", dotClass)} /> : null}
      {icon ? <Icon name={icon} size={isSmall ? 11 : 12} /> : null}
      {children}
    </span>
  );
}

/** Badge tone for a system or project role. */
export function roleTone(role: string): BadgeTone {
  if (role === "ADMIN") return "accent";
  if (role === "PM") return "review";
  if (role === "TEAM_LEAD") return "progress";
  return "neutral";
}
