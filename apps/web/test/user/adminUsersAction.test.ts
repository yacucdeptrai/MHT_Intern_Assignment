import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { adminUsersAction } from "../../app/actions/adminUsersAction";
import { requireUser } from "../../app/utils/auth.server";
import { commitSession, getSession } from "../../app/utils/session.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: "ADMIN" | "PM" | "MEMBER",
  formDataObj?: Record<string, string>,
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${userId.slice(0, 4)}@example.com`;

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

  let body: FormData | undefined;
  let method = "GET";
  if (formDataObj) {
    method = "POST";
    body = new FormData();
    for (const [k, v] of Object.entries(formDataObj)) {
      body.append(k, v);
    }
  }

  const request = new Request(urlStr, {
    method,
    headers,
    body,
  });

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

describe("adminUsersAction", () => {
  it("creates user successfully and returns invite link", async () => {
    const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "create",
      fullName: "Alex Rivera",
      email: "alex@example.com",
      systemRole: "MEMBER",
      department: "DevOps",
    });

    const response = await adminUsersAction(ctx, request);
    expect(response.status).toBe(200);

    const body: { success: boolean; inviteUrl: string; user: { id: string } } = await response.json();
    expect(body.success).toBe(true);
    expect(body.inviteUrl).toContain("/invite/");
    expect(body.user.id).toBeDefined();
  });

  it("returns 400 with preserved values when creating user with duplicate email", async () => {
    const { ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN");
    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "taken@example.com",
      fullName: "Taken",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { request } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "create",
      fullName: "New Copy",
      email: "TAKEN@example.com",
      systemRole: "PM",
    });

    const response = await adminUsersAction(ctx, request);
    expect(response.status).toBe(400);

    const body: {
      success: boolean;
      errors: { email: string[] };
      values: { email: string };
    } = await response.json();
    expect(body.success).toBe(false);
    expect(body.errors.email).toBeDefined();
    expect(body.values.email).toBe("TAKEN@example.com");
  });

  it("updates user, locks user, and soft deletes user", async () => {
    const { ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN");
    const target = await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: "target-action@example.com",
      fullName: "Target Action",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update
    const { request: updateReq } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "update",
      userId: target.id,
      fullName: "Target Renamed",
    });
    const updateRes = await adminUsersAction(ctx, updateReq);
    expect(updateRes.status).toBe(200);

    // Lock
    const { request: lockReq } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "lock",
      userId: target.id,
    });
    const lockRes = await adminUsersAction(ctx, lockReq);
    expect(lockRes.status).toBe(200);

    // Unlock
    const { request: unlockReq } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "unlock",
      userId: target.id,
    });
    const unlockRes = await adminUsersAction(ctx, unlockReq);
    expect(unlockRes.status).toBe(200);

    // Delete
    const { request: deleteReq } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "delete",
      userId: target.id,
    });
    const deleteRes = await adminUsersAction(ctx, deleteReq);
    expect(deleteRes.status).toBe(200);
  });

  it("returns 403 when a non-admin posts to user management action", async () => {
    const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "MEMBER", {
      intent: "create",
      fullName: "Forbidden Attempt",
      email: "forbidden@example.com",
      systemRole: "MEMBER",
    });

    const response = await adminUsersAction(ctx, request);
    expect(response.status).toBe(403);
  });

  it("returns 400 when admin attempts self lockout", async () => {
    const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
      intent: "lock",
      userId: "will-be-replaced",
    });

    // Post with own userId
    const formData = new FormData();
    formData.append("intent", "lock");
    formData.append("userId", userId);

    const headers = new Headers();
    const cookie = request.headers.get("Cookie");
    if (cookie) {
      headers.set("Cookie", cookie);
    }

    const ownRequest = new Request("http://localhost/admin/users", {
      method: "POST",
      headers,
      body: formData,
    });

    const response = await adminUsersAction(ctx, ownRequest);
    expect(response.status).toBe(400);
    const body: { message: string } = await response.json();
    expect(body.message).toContain("You cannot change your own access");
  });

  describe("FR-04 System Role Assignment", () => {
    it("admin changes user system role via intent setRole, producing USER_ROLE_CHANGED audit entry", async () => {
      const { ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN");
      const target = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "member-to-role@example.com",
        fullName: "Role Target",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { request: setRoleReq } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
        intent: "setRole",
        userId: target.id,
        systemRole: "PM",
      });

      const response = await adminUsersAction(ctx, setRoleReq);
      expect(response.status).toBe(200);

      const updated = await userRepository.findById(ctx.db, target.id);
      expect(updated?.systemRole).toBe("PM");

      // Verify audit log entry
      const auditLog = await ctx.db.query.auditLogs.findFirst({
        where: (t, { eq, and }) => and(eq(t.entityId, target.id), eq(t.action, "USER_ROLE_CHANGED")),
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.changes).toEqual({ systemRole: { from: "MEMBER", to: "PM" } });
    });

    it("rejects demoting the last remaining admin with 400 'At least one administrator is required'", async () => {
      const db = createDatabase(env.DB);
      const targetAdmin = await userRepository.insert(db, {
        id: crypto.randomUUID(),
        email: "target-admin@example.com",
        fullName: "Target Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
        intent: "setRole",
        userId: targetAdmin.id,
        systemRole: "MEMBER",
      });

      // Simulate only 1 remaining admin
      const spy = vi.spyOn(userRepository, "countAdmins").mockResolvedValueOnce(1);

      try {
        const response = await adminUsersAction(ctx, request);
        expect(response.status).toBe(400);
        const body: { message: string } = await response.json();
        expect(body.message).toContain("At least one administrator is required");
      } finally {
        spy.mockRestore();
      }
    });

    it("rejects admin attempting to demote themselves with 400 'You cannot change your own access'", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost/admin/users", "ADMIN", {
        intent: "setRole",
        userId: "placeholder",
        systemRole: "MEMBER",
      });

      // Send own userId in form data
      const formData = new FormData();
      formData.append("intent", "setRole");
      formData.append("userId", userId);
      formData.append("systemRole", "MEMBER");

      const headers = new Headers();
      const cookie = request.headers.get("Cookie");
      if (cookie) headers.set("Cookie", cookie);

      const ownReq = new Request("http://localhost/admin/users", {
        method: "POST",
        headers,
        body: formData,
      });

      const response = await adminUsersAction(ctx, ownReq);
      expect(response.status).toBe(400);
      const body: { message: string } = await response.json();
      expect(body.message).toContain("You cannot change your own access");
    });

    it("returns 403 when a non-admin attempts to change system role", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin/users", "MEMBER", {
        intent: "setRole",
        userId: "some-user-id",
        systemRole: "ADMIN",
      });

      const response = await adminUsersAction(ctx, request);
      expect(response.status).toBe(403);
    });

    it("demonstrates role change applies immediately on user's next request", async () => {
      // 1. Target user starts as MEMBER
      const {
        request: userReq,
        ctx: userCtx,
        userId: targetUserId,
      } = await createAuthenticatedRequest("http://localhost/", "MEMBER");

      const initialUser = await requireUser(userCtx, userReq);
      expect(initialUser.systemRole).toBe("MEMBER");

      // 2. Admin upgrades target user to PM
      const { request: adminReq, ctx: adminCtx } = await createAuthenticatedRequest(
        "http://localhost/admin/users",
        "ADMIN",
        {
          intent: "setRole",
          userId: targetUserId,
          systemRole: "PM",
        },
      );
      const roleRes = await adminUsersAction(adminCtx, adminReq);
      expect(roleRes.status).toBe(200);

      // 3. Target user's NEXT request immediately reflects the new systemRole without re-login
      const nextUser = await requireUser(userCtx, userReq);
      expect(nextUser.systemRole).toBe("PM");
    });
  });
});
