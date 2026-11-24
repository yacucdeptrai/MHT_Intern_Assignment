import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading Lucide icon name */
  icon?: IconName;
  /** Trailing Lucide icon name (e.g. "chevron-down" for menus) */
  iconRight?: IconName;
  /** Shortcut hint rendered after the label, e.g. "C" */
  kbd?: string;
  fullWidth?: boolean;
  children?: ReactNode;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[var(--control-sm)] px-2 gap-[5px] text-[12px]",
  md: "h-[var(--control-md)] px-2.5 gap-1.5 text-[13px]",
  lg: "h-[var(--control-lg)] px-3.5 gap-2 text-[14px]",
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 15, lg: 16 };

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-fg-on-accent border-transparent hover:bg-accent-hover active:bg-accent-pressed shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_1px_2px_rgba(15,15,25,.12)]",
  secondary: "bg-surface text-fg border-line-default shadow-xs hover:bg-subtle active:bg-active",
  danger: "bg-surface text-danger border-line-default shadow-xs hover:bg-danger-subtle active:bg-danger-subtle",
  subtle: "bg-hover text-fg border-transparent hover:bg-active active:bg-active",
  ghost: "bg-transparent text-fg-secondary border-transparent hover:bg-hover hover:text-fg active:bg-active",
};

/** Shared classes so links styled as buttons match the Button component exactly. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", fullWidth = false): string {
  return cx(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md border font-medium leading-none no-underline hover:no-underline",
    "cursor-pointer transition-[background-color,color] duration-[var(--duration-instant)] ease-out",
    "disabled:pointer-events-none disabled:opacity-45",
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth && "w-full",
  );
}

/** Text button. One primary per view; secondary for neighbors; ghost in toolbars. */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  kbd,
  fullWidth = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZE[size];
  return (
    <button type={type} className={cx(buttonClass(variant, size, fullWidth), className)} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} style={{ opacity: 0.7 }} /> : null}
      {kbd ? <span className="ml-0.5 font-mono text-[11px] font-medium leading-none opacity-60">{kbd}</span> : null}
    </button>
  );
}
