import type { ReactNode, Ref, SelectHTMLAttributes } from "react";

import { cx } from "./cx";
import { Icon } from "./Icon";
import { controlClass, Field, type ControlSize } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  /** Empty first option, e.g. "All projects" */
  placeholder?: string;
  size?: ControlSize;
  /** Applied to the wrapper (use for width, e.g. w-[200px]) */
  className?: string;
  requiredMark?: boolean;
  ref?: Ref<HTMLSelectElement>;
  fieldClassName?: string;
}

const HEIGHT: Record<ControlSize, string> = {
  sm: "h-[var(--control-sm)]",
  md: "h-[var(--control-md)]",
  lg: "h-[var(--control-lg)]",
};

/** Native select styled as a control, with a chevrons-up-down affordance. */
export function Select({
  label,
  hint,
  error,
  required,
  requiredMark,
  options,
  placeholder,
  size = "md",
  id,
  className,
  fieldClassName,
  ...rest
}: SelectProps) {
  const control = (
    <span className={cx("relative flex items-center", className)}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cx(controlClass(Boolean(error)), HEIGHT[size], "cursor-pointer appearance-none pl-2.5 pr-7")}
        {...rest}
      >
        {placeholder != null ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevrons-up-down" size={13} className="pointer-events-none absolute right-[9px] text-fg-muted" />
    </span>
  );
  if (!label && !hint && !error) {
    return control;
  }
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={requiredMark ?? required}
      htmlFor={id}
      className={fieldClassName}
    >
      {control}
    </Field>
  );
}
