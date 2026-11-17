import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import { profileAction } from "../../app/actions/profileAction";
import { profileLoader } from "../../app/loaders/profileLoader";
import { hashPassword, verifyPassword } from "../../app/services/auth/password.server";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createAuthenticatedRequest(
  urlStr: string,
  options?: {
    formDataObj?: Record<string, string>;
    hasPassword?: boolean;
    password?: string;
    isLocked?: boolean;
    unauthenticated?: boolean;
  },
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `test-${userId}@example.com`;

  let passwordHash: string | null = null;
  let passwordIterations: number | null = null;

  if (options?.hasPassword !== false) {
    const rawPw = options?.password ?? "InitialPassword123!";
    const hashed = await hashPassword(rawPw);
    passwordHash = hashed.hash;
    passwordIterations = hashed.iterations;
  }

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: "Action Test User",
    phone: "+84911112222",
    department: "Engineering",
    passwordHash,
    passwordIterations,
    systemRole: "MEMBER",
    status: options?.isLocked ? "LOCKED" : "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const headers = new Headers();
  if (!options?.unauthenticated) {
    const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
    session.set("userId", userId);
    const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });
    headers.set("Cookie", cookie);
  }

  let body: FormData | undefined;
  let method = "GET";
  if (options?.formDataObj) {
    method = "POST";
    body = new FormData();
    for (const [k, v] of Object.entries(options.formDataObj)) {
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
    storage: {
      put: async () => {
        await Promise.resolve();
      },
      get: async () => {
        await Promise.resolve();
        return null;
      },
      delete: async () => {
        await Promise.resolve();
      },
    },
    user: null,
    requestId: "test-req-profile",
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

describe("profileAction and profileLoader", () => {
  describe("profileLoader (FR-05)", () => {
    it("redirects unauthenticated user to login", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        unauthenticated: true,
      });

      await expect(profileLoader(ctx, request)).rejects.toMatchObject({
        status: 302,
      });
    });

    it("loads profile for authenticated user", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost:5173/profile");

      const result = await profileLoader(ctx, request);
      expect(result.profile.id).toBe(userId);
      expect(result.profile.fullName).toBe("Action Test User");
      expect(result.hasPassword).toBe(true);
    });
  });

  describe("profileAction: updateProfile (FR-06)", () => {
    it("updates fullName and phone", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        formDataObj: {
          intent: "updateProfile",
          fullName: "Renamed User",
          phone: "+84988887777",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(200);

      const json: { success: boolean; user?: { fullName: string; phone: string } } = await response.json();
      expect(json.success).toBe(true);
      expect(json.user?.fullName).toBe("Renamed User");
      expect(json.user?.phone).toBe("+84988887777");

      const dbUser = await userRepository.findById(ctx.db, userId);
      expect(dbUser?.fullName).toBe("Renamed User");
      expect(dbUser?.phone).toBe("+84988887777");
    });

    it("ignores attempted edits to email, department, or systemRole (FR-06 c4)", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        formDataObj: {
          intent: "updateProfile",
          fullName: "Action Test User",
          email: "hacked@example.com",
          department: "Executive",
          systemRole: "ADMIN",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(200);

      const dbUser = await userRepository.findById(ctx.db, userId);
      expect(dbUser?.department).toBe("Engineering");
      expect(dbUser?.systemRole).toBe("MEMBER");
      expect(dbUser?.email).not.toBe("hacked@example.com");
    });

    it("returns 400 when fullName is empty", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        formDataObj: {
          intent: "updateProfile",
          fullName: "",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(400);
      const json: { success: boolean; errors?: { fullName?: string[] } } = await response.json();
      expect(json.success).toBe(false);
      expect(json.errors?.fullName).toBeDefined();
    });
  });

  describe("profileAction: changePassword (FR-06 c2, c3)", () => {
    it("successfully changes password when current password matches (c2)", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        password: "ValidCurrentPassword123!",
        formDataObj: {
          intent: "changePassword",
          currentPassword: "ValidCurrentPassword123!",
          newPassword: "BrandNewPassword789!",
          confirmPassword: "BrandNewPassword789!",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(200);

      const dbUser = await userRepository.findById(ctx.db, userId);
      expect(dbUser?.passwordHash).toBeDefined();
      expect(dbUser?.passwordIterations).toBeDefined();
      if (!dbUser?.passwordHash || !dbUser.passwordIterations) {
        throw new Error("Missing password hash");
      }
      const isNewValid = await verifyPassword("BrandNewPassword789!", {
        hash: dbUser.passwordHash,
        iterations: dbUser.passwordIterations,
      });
      expect(isNewValid).toBe(true);
    });

    it("returns 400 when current password is wrong (c2)", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        password: "ValidCurrentPassword123!",
        formDataObj: {
          intent: "changePassword",
          currentPassword: "IncorrectPassword123!",
          newPassword: "BrandNewPassword789!",
          confirmPassword: "BrandNewPassword789!",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(400);
      const json: { success: boolean; errors?: { currentPassword?: string[] } } = await response.json();
      expect(json.success).toBe(false);
      expect(json.errors?.currentPassword).toBeDefined();
    });

    it("allows SSO user without password to set new password without currentPassword (c3)", async () => {
      const { request, ctx, userId } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        hasPassword: false,
        formDataObj: {
          intent: "changePassword",
          newPassword: "BrandNewPassword789!",
          confirmPassword: "BrandNewPassword789!",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(200);

      const dbUser = await userRepository.findById(ctx.db, userId);
      expect(dbUser?.passwordHash).not.toBeNull();
    });

    it("returns 400 when confirmation does not match", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        hasPassword: false,
        formDataObj: {
          intent: "changePassword",
          newPassword: "BrandNewPassword789!",
          confirmPassword: "MismatchPassword123!",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(400);
      const json: { success: boolean; errors?: { confirmPassword?: string[] } } = await response.json();
      expect(json.errors?.confirmPassword).toBeDefined();
    });

    it("returns 400 when new password is under 10 chars", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        hasPassword: false,
        formDataObj: {
          intent: "changePassword",
          newPassword: "short",
          confirmPassword: "short",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(400);
      const json: { success: boolean; errors?: { newPassword?: string[] } } = await response.json();
      expect(json.errors?.newPassword).toBeDefined();
    });
  });

  describe("profileAction: invalid intent", () => {
    it("returns 400 on unrecognized intent", async () => {
      const { request, ctx } = await createAuthenticatedRequest("http://localhost:5173/profile", {
        formDataObj: {
          intent: "unknownIntent",
        },
      });

      const response = await profileAction(ctx, request);
      expect(response.status).toBe(400);
    });
  });
});
