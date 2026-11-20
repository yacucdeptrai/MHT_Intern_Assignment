import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";

export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  "data-testid"?: string;
}

export interface MenuProps {
  items: MenuItem[];
  onClose?: () => void;
  width?: number;
  className?: string;
}

/** Floating list of actions: 30px rows, 8px radius, lg shadow. */
export function Menu({ items, onClose, width = 220, className }: MenuProps) {
  return (
    <div role="menu" className={cx("flex flex-col rounded-lg bg-raised p-1 shadow-lg", className)} style={{ width }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          data-testid={item["data-testid"]}
          onClick={() => {
            item.onSelect?.();
            onClose?.();
          }}
          className={cx(
            "flex h-[30px] cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[13px] leading-none hover:bg-hover disabled:cursor-default disabled:opacity-50",
            item.danger ? "text-danger" : "text-fg",
          )}
        >
          {item.icon ? (
            <Icon name={item.icon} size={14} className={item.danger ? "text-danger" : "text-fg-muted"} />
          ) : null}
          <span className="flex-1">{item.label}</span>
          {item.checked ? <Icon name="check" size={14} className="text-fg" /> : null}
        </button>
      ))}
    </div>
  );
}

export interface MenuButtonProps {
  label: string;
  icon?: IconName;
  items: MenuItem[];
  align?: "left" | "right";
  "data-testid"?: string;
}

/** Icon button that opens a Menu below it; closes on select, outside click, or Esc. */
export function MenuButton({
  label,
  icon = "ellipsis",
  items,
  align = "right",
  "data-testid": testId,
}: MenuButtonProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const isOpen = anchor !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setAnchor(null);
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setAnchor(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAnchor(null);
      }
    };
    // The menu is anchored to a viewport position, so any scroll closes it.
    const onScroll = () => {
      setAnchor(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <IconButton
        icon={icon}
        label={label}
        size="xs"
        active={isOpen}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          // Fixed positioning keeps the menu clear of scroll containers (tables, panels).
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor((current) => (current ? null : rect));
        }}
        data-testid={testId}
      />
      {anchor ? (
        <div
          className="fixed z-[var(--z-overlay)]"
          style={{
            top: anchor.bottom + 4,
            ...(align === "right" ? { right: window.innerWidth - anchor.right } : { left: anchor.left }),
          }}
        >
          <Menu items={items} width={180} onClose={close} />
        </div>
      ) : null}
    </div>
  );
}
