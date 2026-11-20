import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ControlSize = "sm" | "md" | "lg";

const HEIGHT: Record<ControlSize, string> = {
  sm: "h-[var(--control-sm)]",
  md: "h-[var(--control-md)]",
  lg: "h-[var(--control-lg)]",
};

/** Shared control look: hairline border, xs shadow, accent focus ring, danger border on error. */
export function controlClass(hasError: boolean): string {
  return cx(
    "w-full rounded-md border bg-surface text-[13px] leading-[1.4] text-fg shadow-xs outline-none placeholder:text-fg-faint",
    "transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-out",
    "disabled:bg-subtle disabled:opacity-60",
    hasError
      ? "border-danger focus:shadow-[0_0_0_3px_var(--danger-subtle)]"
      : "border-line-default focus:border-line-focus focus:shadow-focus",
  );
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children?: ReactNode;
  className?: string;
}

/** Label + control + hint/error stack. */
export function Field({ label, hint, error, required = false, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-[12px] font-medium leading-[1.35] text-fg-secondary">
          {label}
          {required ? <span aria-hidden="true" className="ml-[3px] text-danger after:content-['*']" /> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="text-[11.5px] leading-[1.35] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] leading-[1.35] text-fg-muted">{hint}</span>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Leading Lucide icon (e.g. "search") */
  icon?: IconName;
  size?: ControlSize;
  /** Show the asterisk for required fields (defaults to `required`) */
  requiredMark?: boolean;
  ref?: Ref<HTMLInputElement>;
  fieldClassName?: string;
}

/** Text input with optional label, hint, error and leading icon. */
export function Input({
  label,
  hint,
  error,
  required,
  icon,
  size = "md",
  requiredMark,
  id,
  className,
  fieldClassName,
  ...rest
}: InputProps) {
  const control = (
    <span className="relative flex items-center">
      {icon ? <Icon name={icon} size={14} className="pointer-events-none absolute left-[9px] text-fg-muted" /> : null}
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cx(controlClass(Boolean(error)), HEIGHT[size], icon ? "pl-[29px] pr-2.5" : "px-2.5", className)}
        {...rest}
      />
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

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLTextAreaElement>;
  fieldClassName?: string;
}

/** Multiline variant of Input (the design system's `multiline`). */
export function Textarea({
  label,
  hint,
  error,
  required,
  id,
  rows = 4,
  className,
  fieldClassName,
  ...rest
}: TextareaProps) {
  const control = (
    <textarea
      id={id}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cx(controlClass(Boolean(error)), "resize-y px-2.5 py-2 leading-normal", className)}
      {...rest}
    />
  );
  if (!label && !hint && !error) {
    return control;
  }
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={fieldClassName}>
      {control}
    </Field>
  );
}
