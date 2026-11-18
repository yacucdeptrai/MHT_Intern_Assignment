import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";

import { loader as realtimeLoader } from "../../app/routes/api.realtime";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

function makeLoaderArgs(request: Request, ctx: RequestContext): Parameters<typeof realtimeLoader>[0] {
  const contextMap = new Map();
  contextMap.set(requestContextKey, ctx);
  return {
    context: contextMap,
    params: {},
    request,
  } as unknown as Parameters<typeof realtimeLoader>[0];
}

async function createAuthenticatedUser() {
  const db = createDatabase(env.DB);
  const now = new Date();

  const user = await userRepository.insert(db, {
    id: crypto.randomUUID(),
    email: `realtime-user-${crypto.randomUUID()}@example.com`,
    fullName: "Realtime User",
    systemRole: "MEMBER",
    status: "ACTIVE",
    passwordHash: "hash",
    passwordIterations: 100000,
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request("http://localhost:5173"), env.SESSION_SECRET);
  session.set("userId", user.id);
  const cookieHeader = await commitSession(session, {
    secret: env.SESSION_SECRET,
    secure: false,
  });

  const ctx: RequestContext = {
    env,
    db,
    user: null,
    requestId: "test-realtime-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, user, cookieHeader };
}

describe("GET /api/realtime route security (FR-26 c3, docs/07 §4, docs/09 §3.4)", () => {
  it("FR-26 c3 / docs/09 §3.4: returns 401 without a session", async () => {
    const db = createDatabase(env.DB);
    const ctx: RequestContext = {
      env,
      db,
      user: null,
      requestId: "test-anon-req",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      waitUntil: () => {},
      clock: { now: () => new Date() },
    };

    const request = new Request("http://localhost:5173/api/realtime", {
      headers: {
        Upgrade: "websocket",
      },
    });

    const response = await realtimeLoader(makeLoaderArgs(request, ctx));
    expect(response.status).toBe(401);
  });

  it("returns 403 when Origin header does not match APP_BASE_URL", async () => {
    const { ctx, cookieHeader } = await createAuthenticatedUser();

    const request = new Request("http://localhost:5173/api/realtime", {
      headers: {
        Upgrade: "websocket",
        Cookie: cookieHeader,
        Origin: "https://evil-attacker.com",
      },
    });

    const response = await realtimeLoader(makeLoaderArgs(request, ctx));
    expect(response.status).toBe(403);
  });

  it("returns 426 when Upgrade header is missing or not websocket", async () => {
    const { ctx, cookieHeader } = await createAuthenticatedUser();

    const request = new Request("http://localhost:5173/api/realtime", {
      headers: {
        Cookie: cookieHeader,
        Origin: "http://localhost:5173",
      },
    });

    const response = await realtimeLoader(makeLoaderArgs(request, ctx));
    expect(response.status).toBe(426);
  });

  it("upgrades successfully to 101 when session and Upgrade header are valid", async () => {
    const { ctx, cookieHeader } = await createAuthenticatedUser();

    const request = new Request("http://localhost:5173/api/realtime", {
      headers: {
        Upgrade: "websocket",
        Cookie: cookieHeader,
        Origin: "http://localhost:5173",
        "x-user-id": "spoofed-user-id", // Must be ignored / stripped
      },
    });

    const response = await realtimeLoader(makeLoaderArgs(request, ctx));
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
  });
  it("security: a forged x-user-id header cannot bind the socket to another user's hub", async () => {
    const { ctx, user, cookieHeader } = await createAuthenticatedUser();
    const victimId = crypto.randomUUID();

    const response = await realtimeLoader(
      makeLoaderArgs(
        new Request("http://localhost:5173/api/realtime", {
          headers: {
            Upgrade: "websocket",
            Cookie: cookieHeader,
            Origin: "http://localhost:5173",
            "x-user-id": victimId,
          },
        }),
        ctx,
      ),
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (!socket) throw new Error("Missing socket");
    socket.accept();
    const received: string[] = [];
    socket.addEventListener("message", (event) => {
      received.push(typeof event.data === "string" ? event.data : "");
    });

    const dto = (userId: string, title: string) => ({
      id: crypto.randomUUID(),
      userId,
      type: "TASK_ASSIGNED" as const,
      entityId: "task-1",
      projectId: "project-1",
      payload: { title, actorName: "PM" },
      readAt: null,
      createdAt: new Date().toISOString(),
      targetUrl: "/projects/project-1/tasks/task-1",
    });

    // A publish to the spoofed user's hub must not reach this socket...
    await env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(victimId)).publish(dto(victimId, "for victim"));
    expect(received).toHaveLength(0);

    // ...while a publish to the session user's hub does.
    await env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(user.id)).publish(dto(user.id, "for session user"));
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0] ?? "{}")).toMatchObject({
      type: "notification",
      notification: { userId: user.id, payload: { title: "for session user" } },
    });
  });
});
