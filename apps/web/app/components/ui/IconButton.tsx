import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type IconButtonSize = "xs" | "sm" | "md" | "lg";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Accessible name, also shown as the native tooltip */
  label: string;
  size?: IconButtonSize;
  active?: boolean;
  variant?: "ghost" | "outline";
}

const DIM: Record<IconButtonSize, [string, number]> = {
  xs: ["size-[22px]", 14],
  sm: ["size-[26px]", 15],
  md: ["size-[30px]", 16],
  lg: ["size-[36px]", 18],
};

/** Square icon-only button for toolbars, rows and the drawer header. */
export function IconButton({
  icon,
  label,
  size = "sm",
  active = false,
  variant = "ghost",
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  const [dim, iconSize] = DIM[size];
  const isOutline = variant === "outline";
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        dim,
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border p-0",
        "transition-[background-color,color] duration-[var(--duration-instant)] ease-out",
        "hover:bg-hover hover:text-fg active:bg-active disabled:pointer-events-none disabled:opacity-40",
        isOutline ? "border-line-default" : "border-transparent",
        active ? "bg-active text-fg" : isOutline ? "bg-surface text-fg-muted" : "bg-transparent text-fg-muted",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
