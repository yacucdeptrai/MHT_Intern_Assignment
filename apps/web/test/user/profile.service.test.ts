import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { auditLogRepository, createDatabase, userRepository } from "@pm/db";
import type { FileStorage, StoredFile } from "@pm/domain";
import { ForbiddenError, NotFoundError, ValidationError } from "@pm/domain";
import { hashPassword, verifyPassword } from "../../app/services/auth/password.server";
import { profileService } from "../../app/services/user/profile.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

function createMockStorage(): FileStorage & { files: Map<string, { body: Uint8Array; contentType: string }> } {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    files,
    async put(key, body, options) {
      let bytes: Uint8Array;
      if (typeof body === "string") {
        bytes = new TextEncoder().encode(body);
      } else if (body instanceof ArrayBuffer) {
        bytes = new Uint8Array(body);
      } else if (body instanceof Uint8Array) {
        bytes = body;
      } else {
        const chunks: Uint8Array[] = [];
        const reader = body.getReader();
        let chunk = await reader.read();
        while (!chunk.done) {
          chunks.push(chunk.value);
          chunk = await reader.read();
        }
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
      }
      files.set(key, { body: bytes, contentType: options.contentType });
    },
    async get(key): Promise<StoredFile | null> {
      const found = files.get(key);
      if (!found) return null;
      return Promise.resolve({
        key,
        size: found.body.length,
        contentType: found.contentType,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(found.body);
            controller.close();
          },
        }),
      });
    },
    async delete(key) {
      files.delete(key);
      await Promise.resolve();
    },
  };
}

async function createProfileTestContext(options?: {
  password?: string;
  hasPassword?: boolean;
  isLocked?: boolean;
  avatarKey?: string;
}): Promise<{ ctx: RequestContext; userId: string; storage: ReturnType<typeof createMockStorage> }> {
  const id = crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `profile-test-${id}@example.com`;
  const fullName = "Profile User";
  const storage = createMockStorage();

  let passwordHash: string | null = null;
  let passwordIterations: number | null = null;

  if (options?.hasPassword !== false) {
    const rawPw = options?.password ?? "InitialPassword123!";
    const hashed = await hashPassword(rawPw);
    passwordHash = hashed.hash;
    passwordIterations = hashed.iterations;
  }

  await userRepository.insert(db, {
    id,
    email,
    fullName,
    phone: "+84912345678",
    department: "Product Design",
    avatarKey: options?.avatarKey ?? null,
    passwordHash,
    passwordIterations,
    systemRole: "MEMBER",
    status: options?.isLocked ? "LOCKED" : "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    env,
    db,
    storage,
    user: {
      id,
      email,
      fullName,
      systemRole: "MEMBER",
      status: options?.isLocked ? "LOCKED" : "ACTIVE",
      avatarKey: options?.avatarKey ?? null,
    },
    requestId: "test-profile-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, userId: id, storage };
}

describe("profileService", () => {
  describe("getProfile (FR-05 c1)", () => {
    it("returns user profile data, memberships, and password status", async () => {
      const { ctx, userId } = await createProfileTestContext();
      const result = await profileService.getProfile(ctx, userId);

      expect(result.profile.id).toBe(userId);
      expect(result.profile.fullName).toBe("Profile User");
      expect(result.profile.email).toContain("profile-test-");
      expect(result.profile.phone).toBe("+84912345678");
      expect(result.profile.department).toBe("Product Design");
      expect(result.profile.systemRole).toBe("MEMBER");
      expect(result.hasPassword).toBe(true);
      expect(result.memberships).toEqual([]);
    });

    it("returns hasPassword: false for SSO-only user without password", async () => {
      const { ctx, userId } = await createProfileTestContext({ hasPassword: false });
      const result = await profileService.getProfile(ctx, userId);

      expect(result.hasPassword).toBe(false);
    });

    it("throws NotFoundError if user does not exist", async () => {
      const { ctx } = await createProfileTestContext();
      await expect(profileService.getProfile(ctx, "non-existent-user")).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError if user account is locked", async () => {
      const { ctx, userId } = await createProfileTestContext({ isLocked: true });
      await expect(profileService.getProfile(ctx, userId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateProfile (FR-06)", () => {
    it("updates fullName and phone and writes an audit log", async () => {
      const { ctx, userId } = await createProfileTestContext();
      const updated = await profileService.updateProfile(ctx, userId, {
        fullName: "Updated Name",
        phone: "+84999999999",
      });

      expect(updated.fullName).toBe("Updated Name");
      expect(updated.phone).toBe("+84999999999");

      // Verify db persistence
      const inDb = await userRepository.findById(ctx.db, userId);
      expect(inDb?.fullName).toBe("Updated Name");
      expect(inDb?.phone).toBe("+84999999999");

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(ctx.db, "USER", userId);
      expect(logs.some((l) => l.action === "USER_UPDATED")).toBe(true);
    });

    it("prevents updating profile if caller is not the user", async () => {
      const { ctx } = await createProfileTestContext();
      await expect(
        profileService.updateProfile(ctx, "different-user-id", {
          fullName: "Hacker Name",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("changePassword (FR-06 c2, c3)", () => {
    it("successfully changes password when current password matches (c2)", async () => {
      const { ctx, userId } = await createProfileTestContext({ password: "OldValidPassword123!" });

      await profileService.changePassword(ctx, userId, {
        currentPassword: "OldValidPassword123!",
        newPassword: "BrandNewSecurePassword456!",
        confirmPassword: "BrandNewSecurePassword456!",
      });

      const updated = await userRepository.findById(ctx.db, userId);
      expect(updated?.passwordHash).not.toBeNull();
      expect(updated?.passwordIterations).not.toBeNull();
      if (!updated?.passwordHash || !updated.passwordIterations) {
        throw new Error("Missing password hash");
      }
      const isNewValid = await verifyPassword("BrandNewSecurePassword456!", {
        hash: updated.passwordHash,
        iterations: updated.passwordIterations,
      });
      expect(isNewValid).toBe(true);

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(ctx.db, "USER", userId);
      expect(logs.some((l) => l.action === "USER_UPDATED")).toBe(true);
    });

    it("rejects password change if current password is wrong (c2)", async () => {
      const { ctx, userId } = await createProfileTestContext({ password: "OldValidPassword123!" });

      await expect(
        profileService.changePassword(ctx, userId, {
          currentPassword: "WrongPassword!",
          newPassword: "BrandNewSecurePassword456!",
          confirmPassword: "BrandNewSecurePassword456!",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("allows SSO user without password to set password without currentPassword (c3)", async () => {
      const { ctx, userId } = await createProfileTestContext({ hasPassword: false });

      await profileService.changePassword(ctx, userId, {
        newPassword: "BrandNewSecurePassword456!",
        confirmPassword: "BrandNewSecurePassword456!",
      });

      const updated = await userRepository.findById(ctx.db, userId);
      expect(updated?.passwordHash).not.toBeNull();
      expect(updated?.passwordIterations).not.toBeNull();
      if (!updated?.passwordHash || !updated.passwordIterations) {
        throw new Error("Missing password hash");
      }
      const isNewValid = await verifyPassword("BrandNewSecurePassword456!", {
        hash: updated.passwordHash,
        iterations: updated.passwordIterations,
      });
      expect(isNewValid).toBe(true);
    });
  });

  describe("updateAvatar (FR-06 c1, A29)", () => {
    it("uploads avatar to R2 and updates user avatarKey atomically", async () => {
      const { ctx, userId, storage } = await createProfileTestContext();
      const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes

      const result = await profileService.updateAvatar(ctx, userId, {
        bytes: fakeImageBytes,
        contentType: "image/png",
        size: fakeImageBytes.length,
      });

      expect(result.avatarKey).toBe(`avatars/${userId}`);
      expect(storage.files.has(`avatars/${userId}`)).toBe(true);

      const inDb = await userRepository.findById(ctx.db, userId);
      expect(inDb?.avatarKey).toBe(`avatars/${userId}`);

      // Verify audit log
      const logs = await auditLogRepository.listByEntity(ctx.db, "USER", userId);
      expect(logs.some((l) => l.action === "USER_UPDATED")).toBe(true);
    });

    it("rejects avatar exceeding 10 MB", async () => {
      const { ctx, userId } = await createProfileTestContext();
      await expect(
        profileService.updateAvatar(ctx, userId, {
          bytes: new Uint8Array(10),
          contentType: "image/png",
          size: 11 * 1024 * 1024, // 11 MB
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects avatar with unsupported content type", async () => {
      const { ctx, userId } = await createProfileTestContext();
      await expect(
        profileService.updateAvatar(ctx, userId, {
          bytes: new Uint8Array(10),
          contentType: "application/pdf",
          size: 10,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a file declared as PNG whose bytes are not an image", async () => {
      const { ctx, userId, storage } = await createProfileTestContext();
      const disguised = new TextEncoder().encode("<html><script>alert(1)</script></html>");

      await expect(
        profileService.updateAvatar(ctx, userId, {
          bytes: disguised,
          contentType: "image/png",
          size: disguised.length,
        }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        fieldErrors: { file: ["Avatar must be a PNG, JPEG, or WebP image"] },
      });
      expect(storage.files.has(`avatars/${userId}`)).toBe(false);
    });

    it("stores the content type detected from the bytes, not the declared one", async () => {
      const { ctx, userId, storage } = await createProfileTestContext();
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      await profileService.updateAvatar(ctx, userId, {
        bytes: jpegBytes,
        contentType: "image/png",
        size: jpegBytes.length,
      });

      expect(storage.files.get(`avatars/${userId}`)?.contentType).toBe("image/jpeg");
    });

    it("cleans up R2 object if DB batch fails", async () => {
      const { ctx, userId, storage } = await createProfileTestContext();
      const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      // Spy on db.batch to simulate DB failure
      vi.spyOn(ctx.db, "batch").mockRejectedValueOnce(new Error("D1 connection lost"));

      await expect(
        profileService.updateAvatar(ctx, userId, {
          bytes: fakeImageBytes,
          contentType: "image/png",
          size: fakeImageBytes.length,
        }),
      ).rejects.toThrow("D1 connection lost");

      // Verify object was deleted
      expect(storage.files.has(`avatars/${userId}`)).toBe(false);
    });
  });
});
