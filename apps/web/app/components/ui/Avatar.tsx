import type { CSSProperties } from "react";

const HUES = [255, 160, 30, 300, 200, 90, 340];

function hueFor(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return HUES[hash % HUES.length] ?? 255;
}

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "?";
}

export interface AvatarProps {
  name: string;
  /** Photo URL; falls back to initials on a deterministic muted tint */
  src?: string | null;
  size?: number;
  style?: CSSProperties;
  "data-testid"?: string;
}

/** Round user avatar: photo when available, otherwise initials. */
export function Avatar({ name, src, size = 20, style, "data-testid": testId }: AvatarProps) {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        data-testid={testId}
        style={{ ...base, objectFit: "cover", boxShadow: "0 0 0 1px var(--border)" }}
      />
    );
  }
  const hue = hueFor(name);
  return (
    <span
      title={name}
      data-testid={testId}
      style={{
        ...base,
        background: `oklch(0.92 0.035 ${hue})`,
        color: `oklch(0.42 0.08 ${hue})`,
        font: `600 ${Math.max(8, Math.round(size * 0.42))}px/1 var(--font-sans)`,
        letterSpacing: "-0.01em",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface AvatarStackProps {
  names: string[];
  size?: number;
  max?: number;
}

/** Overlapping avatars with a "+N" overflow count. */
export function AvatarStack({ names, size = 20, max = 3 }: AvatarStackProps) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((name, index) => (
        <Avatar
          key={name}
          name={name}
          size={size}
          style={{ marginLeft: index ? -5 : 0, boxShadow: "0 0 0 2px var(--bg-surface)" }}
        />
      ))}
      {extra > 0 ? (
        <span className="ml-1 text-[11px] font-medium leading-none text-fg-muted">{`+${extra}`}</span>
      ) : null}
    </span>
  );
}
