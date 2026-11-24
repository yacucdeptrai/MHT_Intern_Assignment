const PROJECT_DOTS = [
  "var(--blue-500)",
  "var(--green-500)",
  "var(--amber-500)",
  "var(--violet-500)",
  "var(--orange-500)",
  "var(--red-500)",
];

/** Deterministic project square color from the token palette (projects have no stored color). */
export function projectDot(code: string): string {
  let hash = 0;
  for (const char of code) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PROJECT_DOTS[hash % PROJECT_DOTS.length] ?? "var(--blue-500)";
}
