import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import type { SystemRole } from "@pm/domain";
import { loader as appLoader } from "../../app/routes/_app";
import { loader as memberIndexLoader } from "../../app/routes/_app._index";
import { loader as adminGuardLoader } from "../../app/routes/_app.admin";
import { loader as adminIndexLoader } from "../../app/routes/_app.admin._index";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: SystemRole,
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

function makeLoaderArgs(request: Request, ctx: RequestContext) {
  const map = new Map<unknown, unknown>();
  map.set(requestContextKey, ctx);
  return {
    request,
    params: {},
    context: map,
  } as unknown as Parameters<typeof appLoader>[0];
}

describe("App & Layout Loaders", () => {
  describe("_app.tsx loader", () => {
    it("returns user session when authenticated", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost/", "MEMBER");
      const result = await appLoader(makeLoaderArgs(request, ctx));
      expect(result.user).toBeDefined();
      expect(result.user.systemRole).toBe("MEMBER");
    });

    it("redirects unauthenticated user to /login?redirectTo=...", async () => {
      const request = new Request("http://localhost/some-page");
      const ctx: RequestContext = {
        env,
        db: createDatabase(env.DB),
        user: null,
        requestId: "test-req",
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        waitUntil: () => {},
        clock: { now: () => new Date() },
      };

      try {
        await appLoader(makeLoaderArgs(request, ctx));
        expect.unreachable("Should have redirected");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response);
        const res = err as Response;
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("/login?redirectTo=");
      }
    });
  });

  describe("_app._index.tsx loader (Member Home)", () => {
    it("returns user for MEMBER and TEAM_LEAD", async () => {
      const { request: reqMember, ctx: ctxMember } = await createAuthenticatedRequest("http://localhost/", "MEMBER");
      const resMember = await memberIndexLoader(makeLoaderArgs(reqMember, ctxMember));
      expect(resMember.user.systemRole).toBe("MEMBER");

      const { request: reqLead, ctx: ctxLead } = await createAuthenticatedRequest("http://localhost/", "TEAM_LEAD");
      const resLead = await memberIndexLoader(makeLoaderArgs(reqLead, ctxLead));
      expect(resLead.user.systemRole).toBe("TEAM_LEAD");
    });

    it("redirects ADMIN and PM to /admin", async () => {
      const { request: reqAdmin, ctx: ctxAdmin } = await createAuthenticatedRequest("http://localhost/", "ADMIN");
      try {
        await memberIndexLoader(makeLoaderArgs(reqAdmin, ctxAdmin));
        expect.unreachable("Should have redirected admin");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).headers.get("Location")).toBe("/admin");
      }

      const { request: reqPm, ctx: ctxPm } = await createAuthenticatedRequest("http://localhost/", "PM");
      try {
        await memberIndexLoader(makeLoaderArgs(reqPm, ctxPm));
        expect.unreachable("Should have redirected PM");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).headers.get("Location")).toBe("/admin");
      }
    });
  });

  describe("_app.admin.tsx layout guard loader", () => {
    it("allows ADMIN and PM access", async () => {
      const { request: reqAdmin, ctx: ctxAdmin } = await createAuthenticatedRequest("http://localhost/admin", "ADMIN");
      const resAdmin = await adminGuardLoader(makeLoaderArgs(reqAdmin, ctxAdmin));
      expect(resAdmin.user.systemRole).toBe("ADMIN");

      const { request: reqPm, ctx: ctxPm } = await createAuthenticatedRequest("http://localhost/admin", "PM");
      const resPm = await adminGuardLoader(makeLoaderArgs(reqPm, ctxPm));
      expect(resPm.user.systemRole).toBe("PM");
    });

    it("throws 403 response for MEMBER and TEAM_LEAD", async () => {
      const { request: reqMember, ctx: ctxMember } = await createAuthenticatedRequest(
        "http://localhost/admin",
        "MEMBER",
      );
      try {
        await adminGuardLoader(makeLoaderArgs(reqMember, ctxMember));
        expect.unreachable("Should have thrown 403");
      } catch (err: unknown) {
        expect(err).toBeDefined();
      }

      const { request: reqLead, ctx: ctxLead } = await createAuthenticatedRequest(
        "http://localhost/admin",
        "TEAM_LEAD",
      );
      try {
        await adminGuardLoader(makeLoaderArgs(reqLead, ctxLead));
        expect.unreachable("Should have thrown 403");
      } catch (err: unknown) {
        expect(err).toBeDefined();
      }
    });
  });

  describe("_app.admin._index.tsx loader (Admin Dashboard)", () => {
    it("allows ADMIN and PM", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin", "ADMIN");
      const result = await adminIndexLoader(makeLoaderArgs(request, ctx));
      expect(result.user.systemRole).toBe("ADMIN");
    });

    it("rejects non-admin roles", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost/admin", "MEMBER");
      await expect(adminIndexLoader(makeLoaderArgs(request, ctx))).rejects.toThrow();
    });
  });
});
