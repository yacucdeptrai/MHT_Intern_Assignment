import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";

interface SidebarContextValue {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({ isCollapsed: false });

export interface SidebarProps {
  /** 232px expanded, 52px icon rail when collapsed */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Collapsible left sidebar. Compose with WorkspaceSwitcher, SidebarSection and SidebarItem. */
export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  header,
  footer,
  children,
  className,
  "data-testid": testId,
}: SidebarProps) {
  const { t } = useTranslation();
  return (
    <SidebarContext.Provider value={{ isCollapsed: collapsed }}>
      <aside
        data-testid={testId}
        data-collapsed={collapsed ? "true" : "false"}
        className={cx(
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-line bg-sidebar",
          "transition-[width] duration-[var(--duration-slow)] ease-spring",
          collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]",
          className,
        )}
      >
        <div
          className={cx(
            "flex min-h-[var(--topbar-height)] items-center gap-1",
            collapsed ? "flex-col justify-center py-2.5" : "flex-row justify-between p-2.5",
          )}
        >
          {header}
          {onToggleCollapse ? (
            <IconButton
              icon="panel-left"
              label={collapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar")}
              size="xs"
              onClick={onToggleCollapse}
              data-testid="sidebar-toggle"
            />
          ) : null}
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-2 py-1">{children}</nav>
        {footer ? <div className="border-t border-line p-2">{footer}</div> : null}
      </aside>
    </SidebarContext.Provider>
  );
}

export interface WorkspaceSwitcherProps {
  name: string;
  initials?: string;
  subtitle?: string;
  /** Destination when the workspace mark is clicked */
  to?: string;
  onClick?: () => void;
}

/** Workspace initials tile + product name. There is no logo; do not invent one. */
export function WorkspaceSwitcher({ name, initials, subtitle, to, onClick }: WorkspaceSwitcherProps) {
  const { isCollapsed } = useContext(SidebarContext);
  const content = (
    <>
      <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-inverse text-[10px] font-semibold leading-none text-fg-inverse">
        {initials ?? name.slice(0, 2).toUpperCase()}
      </span>
      {isCollapsed ? null : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold leading-[1.2] text-fg">{name}</span>
          {subtitle ? (
            <span className="text-[11px] leading-[1.3] text-fg-muted" data-testid="workspace-subtitle">
              {subtitle}
            </span>
          ) : null}
        </span>
      )}
      {!isCollapsed && onClick ? <Icon name="chevron-down" size={13} className="text-fg-muted" /> : null}
    </>
  );
  const className = cx(
    "flex min-w-0 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent text-left no-underline hover:bg-hover hover:no-underline",
    isCollapsed ? "flex-none p-[3px]" : "flex-1 px-1.5 py-1",
  );
  if (to) {
    return (
      <Link to={to} className={className} title={isCollapsed ? name : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export interface SidebarSectionProps {
  title?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}

/** Group of sidebar items with an optional collapsible title. */
export function SidebarSection({ title, action, defaultOpen = true, children }: SidebarSectionProps) {
  const { isCollapsed } = useContext(SidebarContext);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-px">
      {title && !isCollapsed ? (
        <div className="flex h-6 items-center justify-between px-2">
          <button
            type="button"
            onClick={() => {
              setIsOpen((open) => !open);
            }}
            aria-expanded={isOpen}
            className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium leading-none text-fg-muted"
          >
            {title}
            <Icon
              name="chevron-right"
              size={11}
              style={{
                transform: isOpen ? "rotate(90deg)" : "none",
                transition: "transform var(--duration-fast) var(--ease-out)",
              }}
            />
          </button>
          {action}
        </div>
      ) : title && isCollapsed ? (
        <div className="mx-1.5 my-1 h-px bg-line" />
      ) : null}
      {isOpen || isCollapsed ? children : null}
    </div>
  );
}

export interface SidebarItemProps {
  icon?: IconName;
  label: string;
  count?: number;
  active?: boolean;
  /** Color for a project square instead of an icon */
  dot?: string;
  kbd?: string;
  /** Nest under the item above (1 = project sub-page). Hidden in the collapsed rail. */
  depth?: number;
  /** Route to navigate to; renders a link */
  to?: string;
  onClick?: () => void;
  "data-testid"?: string;
}

/** One navigation row. Exactly one item in the sidebar is active. */
export function SidebarItem({
  icon,
  label,
  count,
  active = false,
  dot,
  kbd,
  depth = 0,
  to,
  onClick,
  "data-testid": testId,
}: SidebarItemProps) {
  const { isCollapsed } = useContext(SidebarContext);
  if (isCollapsed && depth > 0) {
    return null;
  }
  const className = cx(
    "group flex w-full cursor-pointer items-center gap-2 rounded-md border-0 text-left text-[13px] leading-none no-underline hover:no-underline",
    "transition-[background-color] duration-[var(--duration-instant)] ease-out",
    depth ? "h-[26px]" : "h-7",
    isCollapsed ? "justify-center p-0" : "justify-start pr-2",
    active ? "bg-active font-medium text-fg" : "bg-transparent font-normal text-fg-secondary hover:bg-hover",
  );
  const style = isCollapsed ? undefined : { paddingLeft: 8 + depth * 24 };
  const content = (
    <>
      {dot ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center">
          <span className="size-2 rounded-[2px]" style={{ background: dot }} />
        </span>
      ) : icon ? (
        <Icon name={icon} size={16} className={active ? "text-fg" : "text-fg-muted"} />
      ) : null}
      {isCollapsed ? null : <span className="flex-1 truncate">{label}</span>}
      {!isCollapsed && count != null ? (
        <span className="text-[11px] font-medium leading-none text-fg-muted">{count}</span>
      ) : null}
      {!isCollapsed && kbd ? (
        <span className="hidden font-mono text-[10.5px] font-medium leading-none text-fg-faint group-hover:inline">
          {kbd}
        </span>
      ) : null}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className={className}
        style={style}
        aria-label={isCollapsed ? label : undefined}
        title={isCollapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        data-testid={testId}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={style}
      aria-label={isCollapsed ? label : undefined}
      title={isCollapsed ? label : undefined}
      data-testid={testId}
    >
      {content}
    </button>
  );
}
