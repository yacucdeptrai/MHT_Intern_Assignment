import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, notificationRepository, projectRepository, userRepository } from "@pm/db";

import { action as notificationsAction, loader as notificationsLoader } from "../../app/routes/_app.notifications";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

function makeLoaderArgs(request: Request, ctx: RequestContext): Parameters<typeof notificationsLoader>[0] {
  const contextMap = new Map();
  contextMap.set(requestContextKey, ctx);
  return {
    context: contextMap,
    params: {},
    request,
  } as unknown as Parameters<typeof notificationsLoader>[0];
}

function makeActionArgs(request: Request, ctx: RequestContext): Parameters<typeof notificationsAction>[0] {
  const contextMap = new Map();
  contextMap.set(requestContextKey, ctx);
  return {
    context: contextMap,
    params: {},
    request,
  } as unknown as Parameters<typeof notificationsAction>[0];
}

async function createAuthenticatedWorld() {
  const db = createDatabase(env.DB);
  const now = new Date();

  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `route-user-${crypto.randomUUID()}@example.com`,
    fullName: "Route Tester",
    systemRole: "MEMBER",
    status: "ACTIVE",
    passwordHash: "hash",
    passwordIterations: 100000,
    createdAt: now,
    updatedAt: now,
  });

  const otherUser = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `other-user-${crypto.randomUUID()}@example.com`,
    fullName: "Other User",
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
      code: `RN${projectId.slice(0, 4).toUpperCase()}`,
      name: "Route Test Project",
      status: "ACTIVE",
      createdById: user.id,
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  const session = await getSession(new Request("http://localhost/notifications"), env.SESSION_SECRET);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

  const ctx: RequestContext = {
    env,
    db,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "test-route-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { db, user, otherUser, projectId, cookie, ctx, now };
}

describe("notificationsRoute (FR-25 c1..c2, A28)", () => {
  it("redirects unauthenticated users to login with return url", async () => {
    const db = createDatabase(env.DB);
    const anonCtx: RequestContext = {
      env,
      db,
      user: null,
      requestId: "anon-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => new Date() },
    };

    const request = new Request("http://localhost/notifications");
    await expect(notificationsLoader(makeLoaderArgs(request, anonCtx))).rejects.toSatisfy((res: Response) => {
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/login?redirectTo=");
      return true;
    });
  });

  it("FR-25 c1: loader returns paginated notifications and unread count", async () => {
    const { db, user, projectId, cookie, ctx, now } = await createAuthenticatedWorld();

    const notificationId = crypto.randomUUID();
    await notificationRepository.insertStmt(db, {
      id: notificationId,
      userId: user.id,
      type: "TASK_ASSIGNED",
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Fix security audit", actorName: "Lead" },
      readAt: null,
      createdAt: now,
    });

    const request = new Request("http://localhost/notifications", {
      headers: { Cookie: cookie },
    });

    const data = await notificationsLoader(makeLoaderArgs(request, ctx));

    expect(data.unreadCount).toBe(1);
    expect(data.notifications.items).toHaveLength(1);
    expect(data.notifications.items[0]?.id).toBe(notificationId);
    expect(data.notifications.items[0]?.payload.title).toBe("Fix security audit");
  });

  it("FR-25 c2: action marks single notification as read", async () => {
    const { db, user, projectId, cookie, ctx, now } = await createAuthenticatedWorld();

    const notificationId = crypto.randomUUID();
    await notificationRepository.insertStmt(db, {
      id: notificationId,
      userId: user.id,
      type: "TASK_ASSIGNED",
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Review PR", actorName: "Lead" },
      readAt: null,
      createdAt: now,
    });

    const form = new FormData();
    form.append("intent", "markRead");
    form.append("notificationId", notificationId);

    const request = new Request("http://localhost/notifications", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });

    const res = await notificationsAction(makeActionArgs(request, ctx));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, intent: "markRead" });

    const updated = await notificationRepository.findById(db, notificationId);
    expect(updated?.readAt).not.toBeNull();
  });

  it("A28 / security: action rejects markRead on another user's notification with 404", async () => {
    const { db, otherUser, projectId, cookie, ctx, now } = await createAuthenticatedWorld();

    const otherNotificationId = crypto.randomUUID();
    await notificationRepository.insertStmt(db, {
      id: otherNotificationId,
      userId: otherUser.id,
      type: "TASK_ASSIGNED",
      entityId: crypto.randomUUID(),
      projectId,
      payload: { title: "Secret task", actorName: "Lead" },
      readAt: null,
      createdAt: now,
    });

    const form = new FormData();
    form.append("intent", "markRead");
    form.append("notificationId", otherNotificationId);

    const request = new Request("http://localhost/notifications", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });

    await expect(notificationsAction(makeActionArgs(request, ctx))).rejects.toMatchObject({ status: 404 });

    const untouched = await notificationRepository.findById(db, otherNotificationId);
    expect(untouched?.readAt).toBeNull();
  });

  it("FR-25 c2: action marks all notifications read", async () => {
    const { db, user, projectId, cookie, ctx, now } = await createAuthenticatedWorld();

    await db.batch([
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user.id,
        type: "TASK_ASSIGNED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Item 1", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
      notificationRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        userId: user.id,
        type: "TASK_COMMENTED",
        entityId: crypto.randomUUID(),
        projectId,
        payload: { title: "Item 2", actorName: "Lead" },
        readAt: null,
        createdAt: now,
      }),
    ]);

    const form = new FormData();
    form.append("intent", "markAllRead");

    const request = new Request("http://localhost/notifications", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });

    const res = await notificationsAction(makeActionArgs(request, ctx));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, intent: "markAllRead" });

    const unread = await notificationRepository.countUnread(db, user.id);
    expect(unread).toBe(0);
  });
});
