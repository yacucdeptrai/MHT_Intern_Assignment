import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface ViewOption<T extends string = string> {
  id: T;
  label: string;
  icon?: IconName;
  /** Native tooltip, e.g. the full language name */
  title?: string;
  "data-testid"?: string;
}

export interface ViewSwitcherProps<T extends string = string> {
  views: ViewOption<T>[];
  value: T;
  onChange?: (id: T) => void;
  iconOnly?: boolean;
  /** Accessible name for the group */
  label?: string;
  className?: string;
}

/** Segmented control for List / Board / Timeline, Day / Week / Month, or EN / VI. */
export function ViewSwitcher<T extends string = string>({
  views,
  value,
  onChange,
  iconOnly = false,
  label,
  className,
}: ViewSwitcherProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {views.map((view) => {
        const isOn = view.id === value;
        return (
          <button
            key={view.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange?.(view.id)}
            title={view.title ?? (iconOnly ? view.label : undefined)}
            aria-label={iconOnly ? view.label : undefined}
            data-testid={view["data-testid"]}
            className={cx(
              "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md border-0 text-[12px] font-medium leading-none",
              "transition-[background-color,color] duration-[var(--duration-fast)] ease-out",
              iconOnly ? "px-1.5" : "px-[9px]",
              isOn ? "bg-raised text-fg shadow-sm" : "bg-transparent text-fg-muted hover:text-fg",
            )}
          >
            {view.icon ? <Icon name={view.icon} size={14} /> : null}
            {iconOnly ? null : view.label}
          </button>
        );
      })}
    </div>
  );
}
