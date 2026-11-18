import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  attachmentRepository,
  createDatabase,
  cronStateRepository,
  inviteRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src";

describe("cronStateRepository and cleanup helpers (docs/03 §cron_state, docs/07 §2)", () => {
  const db = createDatabase(env.DB);

  it("gets null for non-existent key", async () => {
    const val = await cronStateRepository.get(db, `missing-${crypto.randomUUID()}`);
    expect(val).toBeNull();
  });

  it("inserts, updates and retrieves cron_state entries", async () => {
    const key = `cursor-${crypto.randomUUID()}`;
    const now1 = new Date(1700000000000);
    const now2 = new Date(1700000050000);

    // Initial insert
    await cronStateRepository.upsert(db, key, "cursor-val-1", now1);
    expect(await cronStateRepository.get(db, key)).toBe("cursor-val-1");

    // Update with new value
    await cronStateRepository.upsert(db, key, "cursor-val-2", now2);
    expect(await cronStateRepository.get(db, key)).toBe("cursor-val-2");

    // Update to null
    await cronStateRepository.upsert(db, key, null, now2);
    expect(await cronStateRepository.get(db, key)).toBeNull();
  });

  it("works with upsertStmt in db.batch", async () => {
    const key1 = `batch-${crypto.randomUUID()}-1`;
    const key2 = `batch-${crypto.randomUUID()}-2`;
    const now = new Date();

    await db.batch([
      cronStateRepository.upsertStmt(db, key1, "v1", now),
      cronStateRepository.upsertStmt(db, key2, "v2", now),
    ]);

    expect(await cronStateRepository.get(db, key1)).toBe("v1");
    expect(await cronStateRepository.get(db, key2)).toBe("v2");
  });

  it("findExistingStorageKeys finds matching storage keys and handles empty input", async () => {
    expect(await attachmentRepository.findExistingStorageKeys(db, [])).toEqual(new Set());

    const now = new Date();
    const userId = crypto.randomUUID();
    await userRepository.insert(db, {
      id: userId,
      email: `u-${userId}@example.com`,
      fullName: "Uploader",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();
    const taskId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `P${userId.slice(0, 8)}`.toUpperCase(),
        name: "Project",
        status: "ACTIVE",
        createdById: userId,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId,
        name: `Status-${statusId.slice(0, 8)}`,
        category: "TODO",
        position: 0,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId,
        title: "Task with attachment",
        statusId,
        createdById: userId,
        priority: "MEDIUM",
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const existingKey = `projects/${projectId}/tasks/${taskId}/attachments/${crypto.randomUUID()}-file.pdf`;
    const nonExistingKey = `projects/${projectId}/tasks/${taskId}/attachments/${crypto.randomUUID()}-missing.pdf`;

    await db.batch([
      attachmentRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        taskId,
        uploadedById: userId,
        fileName: "file.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        storageKey: existingKey,
        createdAt: now,
      }),
    ]);

    const found = await attachmentRepository.findExistingStorageKeys(db, [existingKey, nonExistingKey]);
    expect(found.has(existingKey)).toBe(true);
    expect(found.has(nonExistingKey)).toBe(false);
  });

  it("deleteExpiredBeforeStmt deletes invites expired before cutoff", async () => {
    const now = new Date();
    const inviterId = crypto.randomUUID();
    await userRepository.insert(db, {
      id: inviterId,
      email: `inviter-${inviterId}@example.com`,
      fullName: "Inviter",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const t0 = new Date(1700000000000);
    const expiredOldId = crypto.randomUUID();
    const expiredRecentId = crypto.randomUUID();
    const activeId = crypto.randomUUID();

    // Invite expired 40 days before t0
    const expires40DaysAgo = new Date(t0.getTime() - 40 * 24 * 60 * 60 * 1000);
    // Invite expired 10 days before t0
    const expires10DaysAgo = new Date(t0.getTime() - 10 * 24 * 60 * 60 * 1000);
    // Invite expiring 5 days after t0
    const expiresFuture = new Date(t0.getTime() + 5 * 24 * 60 * 60 * 1000);

    await inviteRepository.insert(db, {
      id: expiredOldId,
      email: "old@example.com",
      tokenHash: `hash-${expiredOldId}`,
      invitedById: inviterId,
      expiresAt: expires40DaysAgo,
      createdAt: now,
    });

    await inviteRepository.insert(db, {
      id: expiredRecentId,
      email: "recent@example.com",
      tokenHash: `hash-${expiredRecentId}`,
      invitedById: inviterId,
      expiresAt: expires10DaysAgo,
      createdAt: now,
    });

    await inviteRepository.insert(db, {
      id: activeId,
      email: "active@example.com",
      tokenHash: `hash-${activeId}`,
      invitedById: inviterId,
      expiresAt: expiresFuture,
      createdAt: now,
    });

    // Cutoff is 30 days before t0
    const cutoff = new Date(t0.getTime() - 30 * 24 * 60 * 60 * 1000);
    await db.batch([inviteRepository.deleteExpiredBeforeStmt(db, cutoff)]);

    expect(await inviteRepository.findById(db, expiredOldId)).toBeNull();
    expect(await inviteRepository.findById(db, expiredRecentId)).not.toBeNull();
    expect(await inviteRepository.findById(db, activeId)).not.toBeNull();
  });
});
