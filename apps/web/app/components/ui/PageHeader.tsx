import type { ReactNode } from "react";

import { cx } from "./cx";

export interface PageHeaderProps {
  /** Project code or section name above the title */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One-line description */
  description?: ReactNode;
  actions?: ReactNode;
  /** Status and "Your role" badges beside the title */
  meta?: ReactNode;
  /** Tabs rendered flush under the header */
  tabs?: ReactNode;
  className?: string;
  "data-testid"?: string;
  titleTestId?: string;
}

/** Title block that starts every route: eyebrow, title + badges, description, actions, tabs. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  tabs,
  className,
  "data-testid": testId,
  titleTestId,
}: PageHeaderProps) {
  return (
    <header
      data-testid={testId}
      className={cx("flex flex-col px-7 pt-5", tabs ? "" : "border-b border-line", className)}
    >
      <div className={cx("flex items-start gap-4", tabs ? "pb-3.5" : "pb-[18px]")}>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {eyebrow ? (
            <div className="flex items-center gap-2 text-[12px] font-medium leading-none text-fg-muted">{eyebrow}</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              data-testid={titleTestId}
              className="m-0 text-[length:var(--text-2xl)] font-semibold leading-[var(--leading-tight)] tracking-[-0.025em] text-fg"
            >
              {title}
            </h1>
            {meta}
          </div>
          {description ? (
            <p className="m-0 max-w-[640px] text-[13px] leading-normal text-fg-secondary text-pretty">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  );
}
