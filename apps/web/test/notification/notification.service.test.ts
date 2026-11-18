import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, notificationRepository, projectRepository, userRepository } from "@pm/db";
import { NotFoundError, type SystemRole, UnauthorizedError } from "@pm/domain";

import { notificationService } from "../../app/services/notification.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

function createTestContext(
  user: { id: string; email: string; fullName: string; systemRole: SystemRole } | null,
): RequestContext {
  const db = createDatabase(env.DB);
  return {
    env: { APP_BASE_URL: "http://localhost:5173" } as unknown as Cloudflare.Env,
    db,
    user: user
      ? {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          systemRole: user.systemRole,
          status: "ACTIVE",
        }
      : null,
    requestId: "test-notification-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };
}

describe("notificationService (FR-25 c1..c3, A28)", () => {
  async function setupWorld() {
    const db = createDatabase(env.DB);
    const now = new Date();

    const user1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `notification-user1-${crypto.randomUUID()}@example.com`,
      fullName: "User One",
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
      fullName: "User Two",
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
        code: `NT${projectId.slice(0, 4).toUpperCase()}`,
        name: "Notification Test Project",
        status: "ACTIVE",
        createdById: user1.id,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const ctx1 = createTestContext(user1);
    const ctx2 = createTestContext(user2);

    return { db, user1, user2, projectId, ctx1, ctx2, now };
  }

  it("throws UnauthorizedError when unauthenticated", async () => {
    const anonCtx = createTestContext(null);
    await expect(notificationService.listNotifications(anonCtx)).rejects.toThrow(UnauthorizedError);
    await expect(notificationService.markRead(anonCtx, crypto.randomUUID())).rejects.toThrow(UnauthorizedError);
    await expect(notificationService.markAllRead(anonCtx)).rejects.toThrow(UnauthorizedError);
  });

  it("FR-25 c1: lists caller's notifications newest first with unread count and builds target URLs", async () => {
    const { db, user1, user2, projectId, ctx1, now } = await setupWorld();

    const taskId = crypto.randomUUID();
    const tOlder = new Date(now.getTime() - 5000);
    const tNewer = now;

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "PROJECT_MEMBER_ADDED",
        entityId: projectId,
        projectId,
        payload: { title: "Notification Test Project", actorName: "PM" },
        readAt: new Date(now.getTime() - 2000),
        createdAt: tOlder,
      }),
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_ASSIGNED",
        entityId: taskId,
        projectId,
        payload: { title: "Implement notifications", actorName: "Lead" },
        readAt: null,
        createdAt: tNewer,
      }),
      // Other user's notification
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user2.id,
        type: "TASK_ASSIGNED",
        entityId: taskId,
        projectId,
        payload: { title: "User 2 assignment", actorName: "Lead" },
        readAt: null,
        createdAt: tNewer,
      }),
    ]);

    const result = await notificationService.listNotifications(ctx1);

    expect(result.unreadCount).toBe(1);
    expect(result.notifications.total).toBe(2);
    expect(result.notifications.items).toHaveLength(2);

    // Newest first
    expect(result.notifications.items[0]?.payload.title).toBe("Implement notifications");
    expect(result.notifications.items[0]?.readAt).toBeNull();
    expect(result.notifications.items[0]?.targetUrl).toBe(`/projects/${projectId}/tasks/${taskId}`);

    expect(result.notifications.items[1]?.payload.title).toBe("Notification Test Project");
    expect(result.notifications.items[1]?.readAt).not.toBeNull();
    expect(result.notifications.items[1]?.targetUrl).toBe(`/projects/${projectId}`);
  });

  it("FR-25 c2: marks single unread notification as read", async () => {
    const { db, user1, projectId, ctx1, now } = await setupWorld();

    const notificationId = crypto.randomUUID();
    await notificationRepository.insertStmt(db, {
      id: notificationId,
      userId: user1.id,
      type: "TASK_COMMENTED",
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Task with Comment", actorName: "Member" },
      readAt: null,
      createdAt: now,
    });

    expect(await notificationRepository.countUnread(db, user1.id)).toBe(1);

    await notificationService.markRead(ctx1, notificationId);

    expect(await notificationRepository.countUnread(db, user1.id)).toBe(0);
    const updated = await notificationRepository.findById(db, notificationId);
    expect(updated?.readAt).not.toBeNull();

    // Idempotent: marking again does not fail
    await expect(notificationService.markRead(ctx1, notificationId)).resolves.toBeUndefined();
  });

  it("A28 / security: marking someone else's notification returns 404 and changes nothing", async () => {
    const { db, user2, projectId, ctx1, now } = await setupWorld();

    const user2NotificationId = crypto.randomUUID();
    await notificationRepository.insertStmt(db, {
      id: user2NotificationId,
      userId: user2.id,
      type: "TASK_ASSIGNED",
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Private Ticket", actorName: "Lead" },
      readAt: null,
      createdAt: now,
    });

    // User 1 attempts to mark User 2's notification as read -> 404 NotFoundError
    await expect(notificationService.markRead(ctx1, user2NotificationId)).rejects.toThrow(NotFoundError);

    // Ensure User 2's notification remains unread
    const untouched = await notificationRepository.findById(db, user2NotificationId);
    expect(untouched?.readAt).toBeNull();
  });

  it("FR-25 c2: marks all unread notifications read for the caller in a single update", async () => {
    const { db, user1, user2, projectId, ctx1, now } = await setupWorld();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Task 1", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user1.id,
        type: "TASK_APPROVED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Task 2", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      // User 2 unread
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user2.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "User 2 item", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    expect(await notificationRepository.countUnread(db, user1.id)).toBe(2);
    expect(await notificationRepository.countUnread(db, user2.id)).toBe(1);

    await notificationService.markAllRead(ctx1);

    expect(await notificationRepository.countUnread(db, user1.id)).toBe(0);
    // User 2 remains unread
    expect(await notificationRepository.countUnread(db, user2.id)).toBe(1);
  });
});
