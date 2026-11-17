import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { adminUsersLoader } from "../../app/loaders/adminUsersLoader";
import { commitSession, getSession } from "../../app/utils/session.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: "ADMIN" | "PM" | "MEMBER",
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${userId}@example.com`;

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
  session.set("userId", userId);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

  const headers = new Headers();
  headers.set("Cookie", cookie);

  const request = new Request(urlStr, { headers });
  const ctx: RequestContext = {
    env,
    db,
    user: null,
    requestId: "test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { request, ctx, userId };
}

describe("adminUsersLoader", () => {
  it("loads paginated users list for admin", async () => {
    const { request, ctx } = await createAuthenticatedRequest(
      "http://localhost/admin/users?page=1&pageSize=10",
      "ADMIN",
    );
    const data = await adminUsersLoader(ctx, request);

    expect(data.users).toBeDefined();
    expect(data.users.items.length).toBeGreaterThan(0);
    expect(data.filters.page).toBe(1);
    expect(data.filters.pageSize).toBe(10);
  });

  it("throws 403 when non-admin requests admin users page", async () => {
    const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "MEMBER");
    await expect(adminUsersLoader(ctx, request)).rejects.toThrow();
  });
});
