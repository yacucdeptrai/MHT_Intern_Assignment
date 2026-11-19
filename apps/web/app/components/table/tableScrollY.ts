/**
 * Calculates a viewport-relative table scroll height (Review Lesson #15).
 * Prevents hardcoded table heights (e.g. 100 * 5).
 */
export function tableScrollY(viewportHeight = 800, offset = 300): number {
  return Math.max(200, viewportHeight - offset);
}
