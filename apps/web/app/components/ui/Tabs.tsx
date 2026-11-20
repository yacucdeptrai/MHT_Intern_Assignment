import { Link } from "react-router";

import { cx } from "./cx";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  /** Route for link tabs (project sub-pages); omit for in-page tabs */
  to?: string;
  "data-testid"?: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  /** Accessible name for the tab list */
  label?: string;
  className?: string;
}

const TAB_CLASS =
  "relative inline-flex h-[34px] cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium leading-none no-underline hover:no-underline";

/** Underlined tabs under a PageHeader, or inside the task drawer. */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  return (
    <div
      role={items.some((item) => item.to) ? undefined : "tablist"}
      aria-label={label}
      className={cx("flex gap-[18px] border-b border-line", className)}
    >
      {items.map((item) => {
        const isOn = item.id === value;
        const inner = (
          <>
            {item.label}
            {item.count != null ? (
              <span className="text-[11px] font-medium leading-none text-fg-muted">{item.count}</span>
            ) : null}
            <span
              aria-hidden="true"
              className={cx("absolute inset-x-0 -bottom-px h-0.5 rounded-[2px]", isOn ? "bg-fg" : "bg-transparent")}
            />
          </>
        );
        if (item.to) {
          return (
            <Link
              key={item.id}
              to={item.to}
              aria-current={isOn ? "page" : undefined}
              data-testid={item["data-testid"]}
              className={cx(TAB_CLASS, isOn ? "text-fg" : "text-fg-muted hover:text-fg")}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isOn}
            onClick={() => onChange?.(item.id)}
            data-testid={item["data-testid"]}
            className={cx(TAB_CLASS, isOn ? "text-fg" : "text-fg-muted hover:text-fg")}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
