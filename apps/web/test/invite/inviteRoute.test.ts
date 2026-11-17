import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";

import { action, loader } from "../../app/routes/invite.$token";
import { inviteService } from "../../app/services/invite.service";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";

async function createMockContext(): Promise<RequestContext> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const actorId = crypto.randomUUID();
  const email = `admin-${actorId}@example.com`;

  await userRepository.insert(db, {
    id: actorId,
    email,
    fullName: "Admin Actor",
    systemRole: "ADMIN",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  return {
    env,
    db,
    user: {
      id: actorId,
      email,
      fullName: "Admin Actor",
      systemRole: "ADMIN",
      status: "ACTIVE",
    },
    requestId: "test-request-id",
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

function makeArgs(request: Request, ctx: RequestContext, params: Record<string, string> = {}) {
  const map = new Map<unknown, unknown>();
  map.set(requestContextKey, ctx);
  return {
    request,
    params,
    context: map,
  };
}

describe("invite.$token route", () => {
  it("loader returns valid status and email for valid token", async () => {
    const ctx = await createMockContext();
    const created = await inviteService.createInvite(ctx, { email: "routeloader@example.com" });

    const request = new Request(`http://localhost/invite/${created.inviteToken}`);
    const args = makeArgs(request, ctx, { token: created.inviteToken });

    const data = await loader(args as unknown as Parameters<typeof loader>[0]);
    expect(data.status).toBe("valid");
    expect(data.email).toBe("routeloader@example.com");
  });

  it("loader returns invalid status for non-existent token", async () => {
    const ctx = await createMockContext();
    const request = new Request("http://localhost/invite/bad-token");
    const args = makeArgs(request, ctx, { token: "bad-token" });

    const data = await loader(args as unknown as Parameters<typeof loader>[0]);
    expect(data.status).toBe("invalid");
  });

  it("action returns 400 when passwords do not match or are too short", async () => {
    const ctx = await createMockContext();
    const created = await inviteService.createInvite(ctx, { email: "actionfail@example.com" });

    // 1. Password too short (<10 chars)
    const form1 = new FormData();
    form1.append("password", "short");
    form1.append("confirmPassword", "short");

    const req1 = new Request(`http://localhost/invite/${created.inviteToken}`, {
      method: "POST",
      body: form1,
    });
    const res1 = await action(
      makeArgs(req1, ctx, { token: created.inviteToken }) as unknown as Parameters<typeof action>[0],
    );
    expect(res1.status).toBe(400);
    const body1 = await res1.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body1.success).toBe(false);
    expect(body1.errors.password).toBeDefined();

    // 2. Passwords mismatch
    const form2 = new FormData();
    form2.append("password", "Password12345!");
    form2.append("confirmPassword", "DifferentPassword12345!");

    const req2 = new Request(`http://localhost/invite/${created.inviteToken}`, {
      method: "POST",
      body: form2,
    });
    const res2 = await action(
      makeArgs(req2, ctx, { token: created.inviteToken }) as unknown as Parameters<typeof action>[0],
    );
    expect(res2.status).toBe(400);
    const body2 = await res2.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body2.success).toBe(false);
    expect(body2.errors.confirmPassword).toBeDefined();
  });

  it("action accepts invite, creates session cookie, and redirects", async () => {
    const ctx = await createMockContext();
    const created = await inviteService.createInvite(ctx, { email: "actionsuccess@example.com" });

    const form = new FormData();
    form.append("password", "StrongPassword123!");
    form.append("confirmPassword", "StrongPassword123!");

    const req = new Request(`http://localhost/invite/${created.inviteToken}`, {
      method: "POST",
      body: form,
    });

    const res = await action(
      makeArgs(req, ctx, { token: created.inviteToken }) as unknown as Parameters<typeof action>[0],
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toContain("__session=");
  });

  it("action returns error response if token is invalid or expired", async () => {
    const ctx = await createMockContext();
    const form = new FormData();
    form.append("password", "StrongPassword123!");
    form.append("confirmPassword", "StrongPassword123!");

    const req = new Request("http://localhost/invite/invalid-token-123", {
      method: "POST",
      body: form,
    });

    const res = await action(
      makeArgs(req, ctx, { token: "invalid-token-123" }) as unknown as Parameters<typeof action>[0],
    );
    expect(res.status).toBe(400);
  });
});
