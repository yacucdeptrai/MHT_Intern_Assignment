import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "./client";

export type AppBatchItem = BatchItem<"sqlite">;
export type NonEmptyBatch = [AppBatchItem, ...AppBatchItem[]];

/** Name of the CHECK constraint on `batch_guard`; appears in the D1 error when a guard fires. */
export const VERSION_CONFLICT_MARKER = "version_conflict";

/**
 * Must directly follow an optimistic-concurrency write in a batch. If that write changed 0 rows,
 * this inserts into `batch_guard`, violates its CHECK constraint, and rolls the whole batch back
 * (docs/04-data-access-and-atomicity.md §3.1).
 */
export function conflictGuardStmt(db: AppDatabase): AppBatchItem {
  return db.run(sql`INSERT INTO batch_guard (ok) SELECT 0 WHERE changes() = 0`);
}

/** True when the error (or any error in its `cause` chain) was raised by `conflictGuardStmt`. */
export function isVersionConflict(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.message.includes(VERSION_CONFLICT_MARKER)) return true;
  }
  return false;
}

/** Drops `null` entries (empty statement lists) and returns a non-empty batch for `db.batch`. */
export function compactBatch(items: readonly (AppBatchItem | null)[]): NonEmptyBatch {
  const kept = items.filter((item): item is AppBatchItem => item !== null);
  const [first, ...rest] = kept;
  if (first === undefined) throw new Error("A batch needs at least one statement");
  return [first, ...rest];
}
