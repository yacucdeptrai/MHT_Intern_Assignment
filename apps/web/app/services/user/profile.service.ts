import { auditLogRepository, conflictGuardStmt, userRepository } from "@pm/db";
import type {
  AllowedAvatarMimeType,
  ChangePasswordInput,
  StoredFile,
  MembershipDto,
  ProfileDto,
  ProfileUpdateInput,
} from "@pm/domain";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  detectImageMimeType,
  ForbiddenError,
  MAX_AVATAR_BYTES,
  NotFoundError,
  ValidationError,
} from "@pm/domain";

import type { RequestContext } from "../../utils/requestContext.server";
import { hashPassword, verifyPassword } from "../auth/password.server";
import { R2FileStorage } from "../storage/r2FileStorage.server";

export interface ProfileDetailsResult {
  profile: ProfileDto;
  memberships: MembershipDto[];
  hasPassword: boolean;
}

export interface AvatarUploadInput {
  bytes: Uint8Array;
  contentType: string;
  size: number;
}

export const profileService = {
  async getProfile(ctx: RequestContext, userId: string): Promise<ProfileDetailsResult> {
    const user = await userRepository.findById(ctx.db, userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    if (user.status === "LOCKED") {
      throw new ForbiddenError("Account is locked");
    }

    const profile: ProfileDto = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      department: user.department,
      avatarKey: user.avatarKey,
      systemRole: user.systemRole,
      createdAt: user.createdAt.getTime(),
    };

    return {
      profile,
      memberships: [],
      hasPassword: user.passwordHash !== null && user.passwordIterations !== null,
    };
  },

  async updateProfile(ctx: RequestContext, userId: string, input: ProfileUpdateInput): Promise<ProfileDto> {
    if (!ctx.user || ctx.user.id !== userId) {
      throw new ForbiddenError("You can only update your own profile");
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found");
    }
    if (target.status === "LOCKED") {
      throw new ForbiddenError("Account is locked");
    }

    const trimmedName = input.fullName.trim();
    const phone = input.phone ?? null;

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (trimmedName !== target.fullName) {
      changes.fullName = { from: target.fullName, to: trimmedName };
    }
    if (phone !== target.phone) {
      changes.phone = { from: target.phone, to: phone };
    }

    if (Object.keys(changes).length === 0) {
      return {
        id: target.id,
        email: target.email,
        fullName: target.fullName,
        phone: target.phone,
        department: target.department,
        avatarKey: target.avatarKey,
        systemRole: target.systemRole,
        createdAt: target.createdAt.getTime(),
      };
    }

    const now = ctx.clock.now();
    await ctx.db.batch([
      userRepository.updateStmt(ctx.db, userId, {
        fullName: trimmedName,
        phone,
        updatedAt: now,
      }),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: userId,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes,
        createdAt: now,
      }),
    ]);

    const updated = await userRepository.findById(ctx.db, userId);
    if (!updated) {
      throw new NotFoundError("User not found");
    }

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      phone: updated.phone,
      department: updated.department,
      avatarKey: updated.avatarKey,
      systemRole: updated.systemRole,
      createdAt: updated.createdAt.getTime(),
    };
  },

  async changePassword(ctx: RequestContext, userId: string, input: ChangePasswordInput): Promise<void> {
    if (!ctx.user || ctx.user.id !== userId) {
      throw new ForbiddenError("You can only change your own password");
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found");
    }
    if (target.status === "LOCKED") {
      throw new ForbiddenError("Account is locked");
    }

    if (target.passwordHash !== null && target.passwordIterations !== null) {
      if (!input.currentPassword) {
        throw new ValidationError("Current password is required", {
          currentPassword: ["Current password is required"],
        });
      }
      const isValid = await verifyPassword(input.currentPassword, {
        hash: target.passwordHash,
        iterations: target.passwordIterations,
      });
      if (!isValid) {
        throw new ValidationError("Current password is incorrect", {
          currentPassword: ["Current password is incorrect"],
        });
      }
    }

    const { hash, iterations } = await hashPassword(input.newPassword);
    const now = ctx.clock.now();

    await ctx.db.batch([
      userRepository.updatePasswordStmt(ctx.db, userId, hash, iterations, now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: userId,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes: { password: { from: "[REDACTED]", to: "[REDACTED]" } },
        createdAt: now,
      }),
    ]);
  },

  /**
   * Returns the stored avatar, or null when the user has none.
   * Throws NotFoundError when the user does not exist or is deleted.
   */
  async getAvatar(ctx: RequestContext, userId: string): Promise<StoredFile | null> {
    const user = await userRepository.findById(ctx.db, userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    if (!user.avatarKey) {
      return null;
    }
    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);
    return storage.get(user.avatarKey);
  },

  async updateAvatar(ctx: RequestContext, userId: string, file: AvatarUploadInput): Promise<{ avatarKey: string }> {
    if (!ctx.user || ctx.user.id !== userId) {
      throw new ForbiddenError("You can only update your own avatar");
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found");
    }
    if (target.status === "LOCKED") {
      throw new ForbiddenError("Account is locked");
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new ValidationError("Avatar must be at most 10 MB", {
        file: ["Avatar must be at most 10 MB"],
      });
    }

    // The declared type comes from the client, so the stored type is taken from the file's bytes.
    const detectedType = detectImageMimeType(file.bytes);
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.contentType as AllowedAvatarMimeType) || detectedType === null) {
      throw new ValidationError("Avatar must be a PNG, JPEG, or WebP image", {
        file: ["Avatar must be a PNG, JPEG, or WebP image"],
      });
    }

    const key = `avatars/${userId}`;
    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);

    // Put into R2 storage before the DB batch (A29 pattern)
    await storage.put(key, file.bytes, { contentType: detectedType });

    const now = ctx.clock.now();
    try {
      await ctx.db.batch([
        userRepository.updateAvatarStmt(ctx.db, userId, key, now),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          actorId: userId,
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: userId,
          projectId: null,
          changes: { avatarKey: { from: target.avatarKey, to: key } },
          createdAt: now,
        }),
      ]);
    } catch (err: unknown) {
      // Clean up uploaded object if DB batch fails
      try {
        await storage.delete(key);
      } catch (deleteErr: unknown) {
        ctx.logger.error("Failed to clean up avatar object after DB failure", {
          error: deleteErr instanceof Error ? deleteErr : new Error(String(deleteErr)),
          key,
        });
      }
      throw err;
    }

    return { avatarKey: key };
  },
};
