import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, notificationRepository, projectRepository, userRepository } from "@pm/db";
import type { NotificationDto } from "@pm/domain";

import { notificationService } from "../../app/services/notification.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

describe("UserNotificationHub & publishNotifications (FR-26 c1, docs/07 §4, docs/09 §3.4)", () => {
  async function setupUsers() {
    const db = createDatabase(env.DB);
    const now = new Date();

    const userA = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `user-a-${crypto.randomUUID()}@example.com`,
      fullName: "User A",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const userB = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `user-b-${crypto.randomUUID()}@example.com`,
      fullName: "User B",
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
        code: `HUB${projectId.slice(0, 4).toUpperCase()}`,
        name: "Hub Test Project",
        status: "ACTIVE",
        createdById: userA.id,
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    return { db, userA, userB, projectId, now };
  }

  it("FR-26 c1 / docs/09 §3.4: delivers to every open socket of that user, and to no other user", async () => {
    const { userA, userB } = await setupUsers();

    const hubA = env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(userA.id));
    const hubB = env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(userB.id));

    // Connect socket 1 for User A
    const resA1 = await hubA.fetch("http://localhost:5173/connect", {
      headers: { Upgrade: "websocket" },
    });
    expect(resA1.status).toBe(101);
    expect(resA1.webSocket).toBeDefined();
    const clientA1 = resA1.webSocket;
    if (!clientA1) throw new Error("Missing clientA1 socket");
    clientA1.accept();

    // Connect socket 2 for User A (second tab / device)
    const resA2 = await hubA.fetch("http://localhost:5173/connect", {
      headers: { Upgrade: "websocket" },
    });
    expect(resA2.status).toBe(101);
    expect(resA2.webSocket).toBeDefined();
    const clientA2 = resA2.webSocket;
    if (!clientA2) throw new Error("Missing clientA2 socket");
    clientA2.accept();

    // Connect socket for User B
    const resB = await hubB.fetch("http://localhost:5173/connect", {
      headers: { Upgrade: "websocket" },
    });
    expect(resB.status).toBe(101);
    expect(resB.webSocket).toBeDefined();
    const clientB = resB.webSocket;
    if (!clientB) throw new Error("Missing clientB socket");
    clientB.accept();

    const messagesA1: string[] = [];
    const messagesA2: string[] = [];
    const messagesB: string[] = [];

    clientA1.addEventListener("message", (event) => {
      messagesA1.push(typeof event.data === "string" ? event.data : "");
    });
    clientA2.addEventListener("message", (event) => {
      messagesA2.push(typeof event.data === "string" ? event.data : "");
    });
    clientB.addEventListener("message", (event) => {
      messagesB.push(typeof event.data === "string" ? event.data : "");
    });

    // Publish notification to User A
    const testDtoA: NotificationDto = {
      id: crypto.randomUUID(),
      userId: userA.id,
      type: "TASK_ASSIGNED",
      entityId: "task-123",
      projectId: "proj-123",
      payload: { title: "Task 123", actorName: "PM" },
      readAt: null,
      createdAt: new Date().toISOString(),
      targetUrl: "/projects/proj-123/tasks/task-123",
    };

    await hubA.publish(testDtoA);

    // Both sockets of User A received the notification
    expect(messagesA1.length).toBe(1);
    expect(JSON.parse(messagesA1[0] ?? "{}")).toEqual({
      type: "notification",
      notification: testDtoA,
    });
    expect(messagesA2.length).toBe(1);
    expect(JSON.parse(messagesA2[0] ?? "{}")).toEqual({
      type: "notification",
      notification: testDtoA,
    });

    // User B's socket received NOTHING
    expect(messagesB.length).toBe(0);

    // Clean up
    clientA1.close();
    clientA2.close();
    clientB.close();
  });

  it("publishNotifications reads rows, groups by user, and delivers to their hubs", async () => {
    const { db, userA, userB, projectId, now } = await setupUsers();

    const notificationIdA = crypto.randomUUID();
    const notificationIdB = crypto.randomUUID();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: notificationIdA,
        userId: userA.id,
        type: "TASK_ASSIGNED",
        entityId: "task-A",
        projectId,
        payload: { title: "Task A", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: notificationIdB,
        userId: userB.id,
        type: "TASK_COMMENTED",
        entityId: "task-B",
        projectId,
        payload: { title: "Task B", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    const hubA = env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(userA.id));
    const hubB = env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(userB.id));

    const resA = await hubA.fetch("http://localhost:5173/connect", {
      headers: { Upgrade: "websocket" },
    });
    expect(resA.webSocket).toBeDefined();
    const clientA = resA.webSocket;
    if (!clientA) throw new Error("Missing clientA socket");
    clientA.accept();

    const resB = await hubB.fetch("http://localhost:5173/connect", {
      headers: { Upgrade: "websocket" },
    });
    expect(resB.webSocket).toBeDefined();
    const clientB = resB.webSocket;
    if (!clientB) throw new Error("Missing clientB socket");
    clientB.accept();

    const messagesA: string[] = [];
    const messagesB: string[] = [];

    clientA.addEventListener("message", (event) => {
      messagesA.push(typeof event.data === "string" ? event.data : "");
    });
    clientB.addEventListener("message", (event) => {
      messagesB.push(typeof event.data === "string" ? event.data : "");
    });

    const ctx: RequestContext = {
      env,
      db,
      user: null,
      requestId: "test-publish-req",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      waitUntil: () => {},
      clock: { now: () => new Date() },
    };

    await notificationService.publishNotifications(ctx, [notificationIdA, notificationIdB]);

    expect(messagesA.length).toBe(1);
    const parsedA = JSON.parse(messagesA[0] ?? "{}") as { notification?: { id?: string } };
    expect(parsedA.notification?.id).toBe(notificationIdA);

    expect(messagesB.length).toBe(1);
    const parsedB = JSON.parse(messagesB[0] ?? "{}") as { notification?: { id?: string } };
    expect(parsedB.notification?.id).toBe(notificationIdB);

    clientA.close();
    clientB.close();
  });

  it("publishNotifications swallows and logs hub errors, never throwing", async () => {
    const { db, userA, projectId, now } = await setupUsers();
    const notificationId = crypto.randomUUID();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: notificationId,
        userId: userA.id,
        type: "TASK_ASSIGNED",
        entityId: "task-A",
        projectId,
        payload: { title: "Task A", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    let loggedError: unknown = null;
    const ctx: RequestContext = {
      env: {
        ...env,
        NOTIFICATION_HUB: {
          idFromName: () => {
            throw new Error("Simulated DO failure");
          },
        } as unknown as typeof env.NOTIFICATION_HUB,
      },
      db,
      user: null,
      requestId: "test-swallow-req",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: (_msg: string, context?: unknown) => {
          loggedError = context;
        },
      },
      waitUntil: () => {},
      clock: { now: () => new Date() },
    };

    // Must not throw
    await expect(notificationService.publishNotifications(ctx, [notificationId])).resolves.toBeUndefined();
    expect(loggedError).toBeDefined();
  });
});
