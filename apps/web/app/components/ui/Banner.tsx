import type { ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type BannerTone = "info" | "success" | "warning" | "danger";

const TONES: Record<BannerTone, [string, string, IconName]> = {
  info: ["bg-accent-subtle", "text-accent-text", "circle-dot"],
  success: ["bg-success-subtle", "text-success", "circle-check"],
  warning: ["bg-warning-subtle", "text-due-soon", "triangle-alert"],
  danger: ["bg-danger-subtle", "text-danger", "octagon-alert"],
};

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Use "alert" for errors that must be announced immediately */
  role?: "status" | "alert";
  className?: string;
  "data-testid"?: string;
}

/** Inline message for state that needs explaining: errors, conflicts, frozen tasks. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  role = "status",
  className,
  "data-testid": testId,
}: BannerProps) {
  const [bg, fg, icon] = TONES[tone];
  return (
    <div
      role={role}
      data-testid={testId}
      className={cx("flex items-start gap-2.5 rounded-lg px-3 py-2.5", bg, className)}
    >
      <Icon name={icon} size={15} className={cx("mt-px", fg)} />
      <div className="flex flex-1 flex-col gap-0.5 text-[13px] leading-[1.45] text-fg">
        {title ? <span className="font-medium">{title}</span> : null}
        {children ? <span className="text-fg-secondary">{children}</span> : null}
      </div>
      {action}
    </div>
  );
}
