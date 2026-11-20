/** D1 allows at most 100 bound parameters per statement; keep IN (...) lists well below that. */
export const D1_MAX_IN_LIST = 90;

/** Splits a list into chunks of at most `size` items. */
export function chunk<T>(items: T[], size: number = D1_MAX_IN_LIST): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
