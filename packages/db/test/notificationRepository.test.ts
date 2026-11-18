import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, notificationRepository, projectRepository, userRepository } from "../src";

describe("notificationRepository (docs/03 §notifications, FR-25)", () => {
  async function setupFixture() {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `notification-user1-${crypto.randomUUID()}@example.com`,
      fullName: "Notification User 1",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const user2 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `notification-user2-${crypto.randomUUID()}@example.com`,
      fullName: "Notification User 2",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `NF${projectId.slice(0, 4).toUpperCase()}`,
        name: "Notification Project",
        status: "ACTIVE",
        createdById: user1.id,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    return { db, user1, user2, projectId, now };
  }

  it("inserts single and multiple notifications", async () => {
    const { db, user1, projectId, now } = await setupFixture();

    const notification1 = {
      id: crypto.randomUUID(),
      userId: user1.id,
      type: "TASK_ASSIGNED" as const,
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Task 1", actorName: "Lead" },
      readAt: null,
      createdAt: now,
    };

    await notificationRepository.insertStmt(db, notification1);

    const found = await notificationRepository.findById(db, notification1.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(notification1.id);
    expect(found?.userId).toBe(user1.id);
    expect(found?.type).toBe("TASK_ASSIGNED");
    expect(found?.payload).toEqual({ title: "Task 1", actorName: "Lead" });
  });

  it("counts unread notifications and lists them newest first with pagination", async () => {
    const { db, user1, projectId, now } = await setupFixture();

    const t1 = new Date(now.getTime() - 2000);
    const t2 = new Date(now.getTime() - 1000);
    const t3 = now;

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Older", actorName: "Lead" },
        readAt: new Date(now.getTime() - 500),
        createdAt: t1,
      }),
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_COMMENTED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Middle", actorName: "Member" },
        readAt: null,
        createdAt: t2,
      }),
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_APPROVED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Newest", actorName: "PM" },
        readAt: null,
        createdAt: t3,
      }),
    ]);

    const unreadCount = await notificationRepository.countUnread(db, user1.id);
    expect(unreadCount).toBe(2);

    const page1 = await notificationRepository.listByUserPaginated(db, user1.id, 1, 2);
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]?.payload.title).toBe("Newest");
    expect(page1.items[1]?.payload.title).toBe("Middle");

    const page2 = await notificationRepository.listByUserPaginated(db, user1.id, 2, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.payload.title).toBe("Older");
  });

  it("marks a single notification read for the owner, and refuses to touch another user's row", async () => {
    const { db, user1, user2, projectId, now } = await setupFixture();

    const user1NotificationId = crypto.randomUUID();
    const user2NotificationId = crypto.randomUUID();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: user1NotificationId,
        userId: user1.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "User 1 Task", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: user2NotificationId,
        userId: user2.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "User 2 Task", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    const readAt = new Date();

    // User 1 tries to mark User 2's notification read -> 0 rows updated
    await notificationRepository.markReadStmt(db, user2NotificationId, user1.id, readAt);
    const untouched = await notificationRepository.findById(db, user2NotificationId);
    expect(untouched?.readAt).toBeNull();

    // User 1 marks own notification read -> updated
    await notificationRepository.markReadStmt(db, user1NotificationId, user1.id, readAt);
    const updated = await notificationRepository.findById(db, user1NotificationId);
    expect(updated?.readAt).not.toBeNull();
  });

  it("marks all unread notifications read for the given user in a single update", async () => {
    const { db, user1, user2, projectId, now } = await setupFixture();

    const u1n1 = crypto.randomUUID();
    const u1n2 = crypto.randomUUID();
    const u2n1 = crypto.randomUUID();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: u1n1,
        userId: user1.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Task 1", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: u1n2,
        userId: user1.id,
        type: "TASK_COMMENTED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Task 2", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: u2n1,
        userId: user2.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "User 2 Task", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    const readAt = new Date();
    await notificationRepository.markAllReadStmt(db, user1.id, readAt);

    const u1After = await notificationRepository.countUnread(db, user1.id);
    expect(u1After).toBe(0);

    // User 2 unread count remains 1
    const u2After = await notificationRepository.countUnread(db, user2.id);
    expect(u2After).toBe(1);
  });
});
