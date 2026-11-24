import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";
import { Icon } from "./Icon";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

/**
 * 15px checkbox: accent fill and check when on. A real input sits underneath, so it works in
 * plain forms (name/value) and with checked/onChange.
 */
export function Checkbox({ label, description, className, disabled, ...rest }: CheckboxProps) {
  return (
    <label
      className={cx(
        "relative inline-flex gap-2",
        description ? "items-start" : "items-center",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        disabled={disabled}
        className={cx(
          "peer absolute left-0 m-0 size-[15px] cursor-pointer opacity-0",
          description ? "top-px" : "top-1/2 -translate-y-1/2",
        )}
        {...rest}
      />
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex size-[15px] shrink-0 items-center justify-center rounded-xs border border-line-strong bg-surface text-transparent",
          "transition-[background-color] duration-[var(--duration-instant)] ease-out",
          "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-fg-on-accent peer-focus-visible:shadow-focus",
          Boolean(description) && "mt-px",
        )}
      >
        <Icon name="check" size={11} strokeWidth={3} />
      </span>
      {label ? (
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] leading-[1.3] text-fg">{label}</span>
          {description ? <span className="text-[11.5px] leading-[1.35] text-fg-muted">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
