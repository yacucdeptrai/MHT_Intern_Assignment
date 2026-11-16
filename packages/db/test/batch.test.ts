import { and, eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { compactBatch, conflictGuardStmt, createDatabase, isVersionConflict, type AppBatchItem } from "../src";

// Test-only tables that mimic a versioned entity and its audit trail.
const items = sqliteTable("spike_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  version: integer("version").notNull(),
});
const audit = sqliteTable("spike_audit", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
});

const db = createDatabase(env.DB);

function updateTitleStmt(id: string, expectedVersion: number, title: string): AppBatchItem {
  return db
    .update(items)
    .set({ title, version: sql`${items.version} + 1` })
    .where(and(eq(items.id, id), eq(items.version, expectedVersion)));
}

async function snapshot() {
  const [rows, auditRows, guardRows] = await db.batch([
    db.select().from(items),
    db.select().from(audit),
    db.all<{ ok: number }>(sql`SELECT ok FROM batch_guard`),
  ]);
  return { rows, auditRows, guardRows };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the batch to fail");
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS spike_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, version INTEGER NOT NULL)",
    ),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS spike_audit (id TEXT PRIMARY KEY, item_id TEXT NOT NULL)"),
    env.DB.prepare("DELETE FROM spike_items"),
    env.DB.prepare("DELETE FROM spike_audit"),
  ]);
  await db.insert(items).values({ id: "item-1", title: "Original", version: 1 });
});

describe("conflictGuardStmt (risk R5 proofs)", () => {
  it("proof 3: with the current version, the whole batch commits", async () => {
    await db.batch([
      updateTitleStmt("item-1", 1, "Updated"),
      conflictGuardStmt(db),
      db.insert(audit).values({ id: "audit-1", itemId: "item-1" }),
    ]);

    const { rows, auditRows, guardRows } = await snapshot();
    expect(rows).toEqual([{ id: "item-1", title: "Updated", version: 2 }]);
    expect(auditRows).toHaveLength(1);
    expect(guardRows).toHaveLength(0);
  });

  it("proofs 1 and 2: with a stale version, nothing is written and the error is recognizable", async () => {
    const error = await rejection(
      db.batch([
        updateTitleStmt("item-1", 99, "Should not apply"),
        conflictGuardStmt(db),
        db.insert(audit).values({ id: "audit-1", itemId: "item-1" }),
      ]),
    );

    expect(isVersionConflict(error)).toBe(true);
    const { rows, auditRows, guardRows } = await snapshot();
    expect(rows).toEqual([{ id: "item-1", title: "Original", version: 1 }]);
    expect(auditRows).toHaveLength(0);
    expect(guardRows).toHaveLength(0);
  });

  it("proof 4: changes() refers to the statement directly before the guard", async () => {
    // An earlier insert changes a row, but the guarded update changes none: the guard must still fire,
    // and the earlier insert must be rolled back with the rest of the batch.
    const error = await rejection(
      db.batch([
        db.insert(audit).values({ id: "audit-early", itemId: "item-1" }),
        updateTitleStmt("item-1", 99, "Should not apply"),
        conflictGuardStmt(db),
      ]),
    );

    expect(isVersionConflict(error)).toBe(true);
    expect((await snapshot()).auditRows).toHaveLength(0);
  });

  it("does not fire because of a later statement that legitimately changes 0 rows", async () => {
    await db.batch([
      updateTitleStmt("item-1", 1, "Updated"),
      conflictGuardStmt(db),
      db.delete(audit).where(eq(audit.itemId, "no-such-item")),
    ]);

    expect((await snapshot()).rows[0]?.version).toBe(2);
  });
});

describe("isVersionConflict", () => {
  it("recognizes the marker anywhere in the cause chain", () => {
    const driverError = new Error("D1_ERROR: CHECK constraint failed: version_conflict: SQLITE_CONSTRAINT");
    expect(isVersionConflict(new Error("Failed query", { cause: driverError }))).toBe(true);
  });

  it("ignores other database errors and non-errors", () => {
    expect(isVersionConflict(new Error("UNIQUE constraint failed: spike_audit.id"))).toBe(false);
    expect(isVersionConflict("version_conflict")).toBe(false);
    expect(isVersionConflict(undefined)).toBe(false);
  });
});

describe("compactBatch", () => {
  it("drops null entries and keeps the order of the rest", () => {
    const first = db.delete(audit).where(eq(audit.id, "a"));
    const second = db.delete(audit).where(eq(audit.id, "b"));
    expect(compactBatch([first, null, second])).toEqual([first, second]);
  });

  it("refuses to build an empty batch", () => {
    expect(() => compactBatch([null, null])).toThrow("A batch needs at least one statement");
  });
});
