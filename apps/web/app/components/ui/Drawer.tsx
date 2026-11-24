import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "./cx";
import { IconButton } from "./IconButton";

export interface DrawerProps {
  onClose?: () => void;
  /** Left side of the 44px toolbar (breadcrumb, prev/next, copy link) */
  toolbar?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** CSS width, default var(--drawer-width) */
  width?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Non-modal slide-over docked to the right edge: no scrim, the page behind stays usable.
 * Slides 24px and fades in; Esc closes.
 */
export function Drawer({ onClose, toolbar, children, footer, width, className, "data-testid": testId }: DrawerProps) {
  const { t } = useTranslation();
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsShown(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!onClose) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) : false;
      if (event.key === "Escape" && !isTyping && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <aside
      role="complementary"
      data-testid={testId}
      className={cx(
        "fixed inset-y-0 right-0 z-[var(--z-drawer)] flex max-w-full flex-col bg-surface shadow-drawer",
        "transition-[transform,opacity] duration-[var(--duration-slow)] ease-spring",
        isShown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
        className,
      )}
      style={{ width: width ?? "var(--drawer-width)" }}
    >
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center gap-1 border-b border-line pl-4 pr-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
        {onClose ? (
          <IconButton icon="x" label={t("common.close")} onClick={onClose} data-testid="drawer-close" />
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer ? <div className="shrink-0 border-t border-line p-3">{footer}</div> : null}
    </aside>
  );
}

export interface PropertyRowProps {
  label: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
}

/** 96px label column + value, 32px row (drawer properties grid). */
export function PropertyRow({ label, children, "data-testid": testId }: PropertyRowProps) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="w-24 shrink-0 text-[12.5px] leading-none text-fg-muted">{label}</span>
      <div
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-[1.3] text-fg"
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}
