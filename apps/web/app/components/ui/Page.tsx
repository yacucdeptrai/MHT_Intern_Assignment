import type { ReactNode } from "react";

import { cx } from "./cx";

export interface PageProps {
  header: ReactNode;
  children?: ReactNode;
  /** Content max width (default 1120, the --content-max token) */
  maxWidth?: number;
  /** Full-bleed body without padding (lists, boards, calendars) */
  flush?: boolean;
  className?: string;
}

/** Route body: PageHeader, then a padded column of panels. */
export function Page({ header, children, maxWidth = 1120, flush = false, className }: PageProps) {
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      {header}
      <div
        className={cx(flush ? "flex min-h-0 flex-1 flex-col" : "flex w-full flex-col gap-4 px-7 pb-10 pt-5", className)}
        style={flush ? undefined : { maxWidth: maxWidth + 56 }}
      >
        {children}
      </div>
    </div>
  );
}

export interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** 16px body padding */
  pad?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** Bordered section with a title row (title, count, subtitle, action). */
export function Panel({
  title,
  subtitle,
  count,
  action,
  children,
  pad = false,
  className,
  "data-testid": testId,
}: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={cx("flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface", className)}
    >
      {title ? (
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <h2 className="m-0 flex items-center gap-2 text-[13.5px] font-semibold leading-[1.2] text-fg">
              {title}
              {count != null ? (
                <span
                  className="text-[12px] font-medium leading-none text-fg-muted"
                  data-testid={testId ? `${testId}-count` : undefined}
                >
                  {count}
                </span>
              ) : null}
            </h2>
            {subtitle ? <span className="text-[12px] leading-[1.3] text-fg-muted">{subtitle}</span> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cx("flex flex-col", pad && "p-4")}>{children}</div>
    </section>
  );
}

/** Muted one-line empty message inside a panel. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="px-4 py-5 text-[12.5px] leading-[1.4] text-fg-muted">{children}</div>;
}

/** Wrapping row of filters and actions. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
