import { cx } from "./cx";

export interface KbdProps {
  /** Each entry renders as its own key cap, e.g. ["⌘", "K"] */
  keys: string[];
  size?: "xs" | "sm";
  className?: string;
}

/** Keyboard shortcut hint in mono key caps. */
export function Kbd({ keys, size = "sm", className }: KbdProps) {
  const dim = size === "xs" ? "h-4 min-w-4" : "h-[18px] min-w-[18px]";
  return (
    <span className={cx("inline-flex gap-[3px]", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className={cx(
            dim,
            "inline-flex items-center justify-center rounded-sm border border-line-default bg-subtle px-1",
            "font-mono text-[11px] font-medium leading-none text-fg-secondary shadow-[0_1px_0_var(--border)]",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
