import type { ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Title + one line, with an optional action. */
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <div data-testid={testId} className={cx("flex flex-col items-center gap-1.5 px-6 py-12 text-center", className)}>
      <span className="mb-2 inline-flex size-9 items-center justify-center rounded-lg border border-line-default text-fg-muted">
        <Icon name={icon} size={18} />
      </span>
      <span className="text-[14px] font-medium leading-[1.3] text-fg">{title}</span>
      {description ? (
        <span className="max-w-[320px] text-[13px] leading-normal text-fg-muted">{description}</span>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
