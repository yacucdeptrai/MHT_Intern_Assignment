import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./Kbd";

export interface CommandItem {
  id: string;
  label: string;
  icon?: IconName;
  iconEl?: ReactNode;
  hint?: string;
  kbd?: string[];
  onSelect?: () => void;
}

export interface CommandGroup {
  title: string;
  items: CommandItem[];
}

export interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
  /** When set, typing offers "Create task: “…”" as the first row */
  onCreate?: (title: string) => void;
  createLabel?: string;
}

interface FlatEntry {
  group: string | null;
  item: CommandItem & { query?: string };
}

/** Global ⌘K palette: jump to pages, run commands, quick-add. Mounting on open resets the query. */
export function CommandBar({ open, ...rest }: CommandBarProps) {
  return open ? <CommandPanel {...rest} /> : null;
}

function CommandPanel({ onClose, groups, placeholder, onCreate, createLabel }: Omit<CommandBarProps, "open">) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const flat = useMemo<FlatEntry[]>(() => {
    const needle = query.trim().toLowerCase();
    const entries: FlatEntry[] = [];
    if (needle && onCreate) {
      const title = query.trim();
      entries.push({
        group: null,
        item: {
          id: "__create",
          icon: "plus",
          label: `${createLabel ?? t("command.create_task")}: `,
          query: title,
          onSelect: () => {
            onCreate(title);
          },
        },
      });
    }
    for (const group of groups) {
      for (const item of group.items) {
        if (!needle || `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(needle)) {
          entries.push({ group: group.title, item });
        }
      }
    }
    return entries;
  }, [query, groups, onCreate, createLabel, t]);

  const select = (entry: FlatEntry | undefined) => {
    entry?.item.onSelect?.();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(flat[index]);
    } else if (event.key === "Escape") {
      onClose();
    }
  };

  let lastGroup: string | null | undefined;

  return (
    <div
      className="fixed inset-0 z-[var(--z-command)] flex items-start justify-center bg-overlay px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
      data-testid="command-bar"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("command.title")}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex w-full max-w-[var(--command-width)] flex-col overflow-hidden rounded-xl bg-raised shadow-xl"
      >
        <div className="flex h-[52px] items-center gap-2.5 border-b border-line px-4">
          <Icon name="search" size={16} className="text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? t("command.placeholder")}
            aria-label={t("command.title")}
            data-testid="command-input"
            className="flex-1 border-0 bg-transparent text-[15px] leading-none text-fg shadow-none outline-none placeholder:text-fg-faint focus-visible:shadow-none"
          />
          <Kbd keys={["esc"]} />
        </div>
        <div role="listbox" className="max-h-[360px] overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <div className="px-3 py-7 text-center text-[13px] leading-[1.4] text-fg-muted">
              {t("command.no_results", { query })}
            </div>
          ) : null}
          {flat.map((entry, position) => {
            const showHeader = entry.group !== lastGroup && entry.group;
            lastGroup = entry.group;
            const isOn = position === index;
            return (
              <Fragment key={entry.item.id}>
                {showHeader ? (
                  <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium leading-none text-fg-muted">
                    {entry.group}
                  </div>
                ) : null}
                <div
                  role="option"
                  aria-selected={isOn}
                  tabIndex={-1}
                  onMouseEnter={() => {
                    setIndex(position);
                  }}
                  onClick={() => {
                    select(entry);
                  }}
                  className={cx(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] leading-none text-fg",
                    isOn ? "bg-hover" : "bg-transparent",
                  )}
                >
                  {entry.item.iconEl ?? (
                    <Icon
                      name={entry.item.icon ?? "arrow-up-right"}
                      size={15}
                      className={isOn ? "text-fg" : "text-fg-muted"}
                    />
                  )}
                  <span className="flex-1 truncate">
                    {entry.item.label}
                    {entry.item.query ? <span className="font-medium">{`“${entry.item.query}”`}</span> : null}
                  </span>
                  {entry.item.hint ? (
                    <span className="text-[12px] leading-none text-fg-muted">{entry.item.hint}</span>
                  ) : null}
                  {entry.item.kbd ? <Kbd keys={entry.item.kbd} size="xs" /> : null}
                  {isOn && !entry.item.kbd ? (
                    <Icon name="corner-down-left" size={13} className="text-fg-muted" />
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
        <div className="flex h-[34px] items-center gap-3.5 border-t border-line bg-subtle px-3.5 text-[11px] leading-none text-fg-muted">
          <span className="inline-flex items-center gap-[5px]">
            <Kbd keys={["↑", "↓"]} size="xs" />
            {t("command.navigate")}
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <Kbd keys={["↵"]} size="xs" />
            {t("command.select")}
          </span>
        </div>
      </div>
    </div>
  );
}
