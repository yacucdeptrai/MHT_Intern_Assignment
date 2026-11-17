import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { conflictGuardStmt, isVersionConflict } from "../src/batch";
import { createDatabase } from "../src/client";
import { taskStatusRepository } from "../src/index";

describe("taskStatusRepository", () => {
  it("FR-20 c1: inserts and lists task statuses ordered by position", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    await db.batch([
      taskStatusRepository.insertStmt(db, {
        id: id1,
        name: `Backlog-${Date.now()}`,
        category: "TODO",
        position: 10,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: id2,
        name: `In Review-${Date.now()}`,
        category: "REVIEW",
        position: 5,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const statuses = await taskStatusRepository.list(db);
    expect(statuses.length).toBeGreaterThanOrEqual(2);

    const found1 = statuses.find((s) => s.id === id1);
    const found2 = statuses.find((s) => s.id === id2);
    expect(found1).toBeDefined();
    expect(found2).toBeDefined();

    // Verify ordering by position ASC
    const idx2 = statuses.findIndex((s) => s.id === id2);
    const idx1 = statuses.findIndex((s) => s.id === id1);
    expect(idx2).toBeLessThan(idx1);
  });

  it("FR-20 c1: enforces case-insensitive uniqueness on status name", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const baseName = `UniqueStatus-${Date.now()}`;

    await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: baseName,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: baseName.toLowerCase(),
        category: "IN_PROGRESS",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });

  it("FR-20 c2: partial unique index uq_task_statuses_default prevents multiple defaults per category", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `Default-1-${Date.now()}`,
      category: "TODO",
      position: 1,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: `Default-2-${Date.now()}`,
        category: "TODO",
        position: 2,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });

  it("FR-20 c2 / A25: atomic setDefault clears old default and sets new default with version guards", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const oldId = crypto.randomUUID();
    const newId = crypto.randomUUID();

    await db.batch([
      taskStatusRepository.insertStmt(db, {
        id: oldId,
        name: `OldDefault-${Date.now()}`,
        category: "IN_PROGRESS",
        position: 1,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: newId,
        name: `NewDefault-${Date.now()}`,
        category: "IN_PROGRESS",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Atomic switch A25: clear old default, guard, set new default, guard
    await db.batch([
      taskStatusRepository.clearDefaultStmt(db, oldId, now),
      conflictGuardStmt(db),
      taskStatusRepository.setDefaultStmt(db, newId, now),
      conflictGuardStmt(db),
    ]);

    const oldStatus = await taskStatusRepository.findById(db, oldId);
    const newStatus = await taskStatusRepository.findById(db, newId);
    expect(oldStatus?.isDefault).toBe(false);
    expect(newStatus?.isDefault).toBe(true);
  });

  it("FR-20 c2 / A25: fails when old default cannot be cleared (concurrent change)", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const wrongId = crypto.randomUUID();
    const targetId = crypto.randomUUID();

    await taskStatusRepository.insert(db, {
      id: targetId,
      name: `Target-${Date.now()}`,
      category: "REVIEW",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      db.batch([
        taskStatusRepository.clearDefaultStmt(db, wrongId, now),
        conflictGuardStmt(db),
        taskStatusRepository.setDefaultStmt(db, targetId, now),
        conflictGuardStmt(db),
      ]),
    ).rejects.toSatisfy(isVersionConflict);
  });

  it("FR-20 c3 / A26: deleteStmt deletes an unused non-default status", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const statusId = crypto.randomUUID();

    await taskStatusRepository.insert(db, {
      id: statusId,
      name: `ToDelete-${Date.now()}`,
      category: "TODO",
      position: 99,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.batch([taskStatusRepository.deleteStmt(db, statusId), conflictGuardStmt(db)]);

    const found = await taskStatusRepository.findById(db, statusId);
    expect(found).toBeNull();
  });

  it("FR-20 c3 / A26: deleteStmt fails on default status via conflict guard", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const defaultId = crypto.randomUUID();

    await taskStatusRepository.insert(db, {
      id: defaultId,
      name: `DefaultToDelete-${Date.now()}`,
      category: "DONE",
      position: 1,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    await expect(db.batch([taskStatusRepository.deleteStmt(db, defaultId), conflictGuardStmt(db)])).rejects.toSatisfy(
      isVersionConflict,
    );
  });
});
