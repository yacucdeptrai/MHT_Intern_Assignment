import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cx } from "./cx";
import { Icon } from "./Icon";

export interface BreadcrumbItem {
  label: string;
  to?: string;
  onClick?: () => void;
  /** Render in mono, e.g. a task key */
  mono?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Top bar trail: Projects › Mobile App Redesign › Sprints. The last item is the current page.
 * Rendered as a labelled list (not a second navigation landmark) so the sidebar stays the only nav.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("shell.breadcrumb")}
      data-testid="breadcrumb"
      className={cx("flex min-w-0 items-center gap-1 text-[13px] font-medium leading-none", className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const key = `${String(index)}-${item.label}`;
        return (
          <Fragment key={key}>
            {index ? <Icon name="chevron-right" size={13} className="text-fg-faint" /> : null}
            {isLast ? (
              <span
                aria-current="page"
                className={cx("truncate text-fg", item.mono === true && "font-mono text-[12px]")}
              >
                {item.label}
              </span>
            ) : item.to ? (
              <Link
                to={item.to}
                className={cx(
                  "-mx-1 whitespace-nowrap rounded-sm p-1 text-fg-muted no-underline hover:text-fg hover:no-underline",
                  item.mono === true && "font-mono text-[12px]",
                )}
              >
                {item.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                disabled={!item.onClick}
                className={cx(
                  "-mx-1 whitespace-nowrap rounded-sm border-0 bg-transparent p-1 text-fg-muted enabled:cursor-pointer enabled:hover:text-fg",
                  item.mono === true && "font-mono text-[12px]",
                )}
              >
                {item.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
