import { conflictGuardStmt, inviteRepository, userRepository, auditLogRepository } from "@pm/db";
import type {
  ActorContext,
  Page,
  SystemRole,
  UserAdminRow,
  UserCreateInput,
  UserFiltersInput,
  UserUpdateInput,
} from "@pm/domain";
import {
  canManageUsers,
  ForbiddenError,
  NotFoundError,
  TOKEN_INVITE_EXPIRY_MS,
  UserFiltersSchema,
  ValidationError,
} from "@pm/domain";

import type { RequestContext } from "../../utils/requestContext.server";

function getActorContext(ctx: RequestContext): ActorContext {
  if (!ctx.user) {
    throw new ForbiddenError();
  }
  return {
    userId: ctx.user.id,
    systemRole: ctx.user.systemRole,
    projectRole: null,
    isProjectArchived: false,
  };
}

export interface CreateUserResult {
  user: UserAdminRow;
  inviteId: string;
  inviteToken: string;
  inviteUrl: string;
}

export const userService = {
  async createUser(ctx: RequestContext, input: UserCreateInput): Promise<CreateUserResult> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }

    const email = input.email.trim().toLowerCase();
    const existing = await userRepository.findByEmail(ctx.db, email, { includeDeleted: true });
    if (existing) {
      throw new ValidationError("Email is already in use", {
        key: "errors.user_email_in_use",
        fieldErrors: { email: ["Email is already in use"] },
      });
    }

    const userId = crypto.randomUUID();
    const inviteId = crypto.randomUUID();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const tokenHex = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const digest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

    const now = ctx.clock.now();
    const expiresAt = new Date(now.getTime() + TOKEN_INVITE_EXPIRY_MS);

    try {
      await ctx.db.batch([
        userRepository.insertStmt(ctx.db, {
          id: userId,
          email,
          fullName: input.fullName.trim(),
          department: input.department ?? null,
          systemRole: input.systemRole,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        }),
        inviteRepository.insertStmt(ctx.db, {
          id: inviteId,
          email,
          tokenHash,
          userId,
          projectId: null,
          projectRole: null,
          invitedById: actor.userId,
          expiresAt,
          createdAt: now,
        }),
        auditLogRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          actorId: actor.userId,
          action: "USER_CREATED",
          entityType: "USER",
          entityId: userId,
          projectId: null,
          changes: {
            systemRole: { from: null, to: input.systemRole },
            email: { from: null, to: email },
            fullName: { from: null, to: input.fullName.trim() },
          },
          createdAt: now,
        }),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("uq_users_email")) {
        throw new ValidationError("Email is already in use", {
          key: "errors.user_email_in_use",
          fieldErrors: { email: ["Email is already in use"] },
        });
      }
      throw err;
    }

    const inviteUrl = `${ctx.env.APP_BASE_URL.replace(/\/+$/, "")}/invite/${tokenHex}`;
    const user: UserAdminRow = {
      id: userId,
      email,
      fullName: input.fullName.trim(),
      phone: null,
      department: input.department ?? null,
      systemRole: input.systemRole,
      status: "ACTIVE",
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    };

    return {
      user,
      inviteId,
      inviteToken: tokenHex,
      inviteUrl,
    };
  },

  async updateUser(ctx: RequestContext, input: UserUpdateInput): Promise<UserAdminRow> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }

    const target = await userRepository.findById(ctx.db, input.userId);
    if (!target) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    const dataToUpdate: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (input.fullName !== undefined) {
      const trimmed = input.fullName.trim();
      if (trimmed !== target.fullName) {
        dataToUpdate.fullName = trimmed;
        changes.fullName = { from: target.fullName, to: trimmed };
      }
    }

    if (input.department !== undefined) {
      const dept = input.department || null;
      if (dept !== target.department) {
        dataToUpdate.department = dept;
        changes.department = { from: target.department, to: dept };
      }
    }

    if (input.email !== undefined) {
      const normalized = input.email.trim().toLowerCase();
      if (normalized !== target.email) {
        const existing = await userRepository.findByEmail(ctx.db, normalized, { includeDeleted: true });
        if (existing && existing.id !== input.userId) {
          throw new ValidationError("Email is already in use", {
            key: "errors.user_email_in_use",
            fieldErrors: { email: ["Email is already in use"] },
          });
        }
        dataToUpdate.email = normalized;
        changes.email = { from: target.email, to: normalized };
      }
    }

    if (input.systemRole !== undefined && input.systemRole !== target.systemRole) {
      if (actor.userId === input.userId && input.systemRole !== "ADMIN") {
        throw new ValidationError("You cannot change your own access", {
          key: "errors.user_change_own_access_forbidden",
        });
      }
      if (target.systemRole === "ADMIN" && input.systemRole !== "ADMIN") {
        const adminCount = await userRepository.countAdmins(ctx.db);
        if (adminCount <= 1) {
          throw new ValidationError("At least one administrator is required", {
            key: "errors.user_at_least_one_admin",
          });
        }
      }
      dataToUpdate.systemRole = input.systemRole;
      changes.systemRole = { from: target.systemRole, to: input.systemRole };
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return {
        id: target.id,
        email: target.email,
        fullName: target.fullName,
        phone: target.phone,
        department: target.department,
        systemRole: target.systemRole,
        status: target.status,
        createdAt: target.createdAt.getTime(),
        updatedAt: target.updatedAt.getTime(),
      };
    }

    const now = ctx.clock.now();
    dataToUpdate.updatedAt = now;

    const action = changes.systemRole && Object.keys(changes).length === 1 ? "USER_ROLE_CHANGED" : "USER_UPDATED";

    try {
      await ctx.db.batch([
        userRepository.updateStmt(ctx.db, input.userId, dataToUpdate),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          actorId: actor.userId,
          action,
          entityType: "USER",
          entityId: input.userId,
          projectId: null,
          changes,
          createdAt: now,
        }),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("uq_users_email")) {
        throw new ValidationError("Email is already in use", {
          key: "errors.user_email_in_use",
          fieldErrors: { email: ["Email is already in use"] },
        });
      }
      throw err;
    }

    const updated = await userRepository.findById(ctx.db, input.userId);
    if (!updated) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      phone: updated.phone,
      department: updated.department,
      systemRole: updated.systemRole,
      status: updated.status,
      createdAt: updated.createdAt.getTime(),
      updatedAt: updated.updatedAt.getTime(),
    };
  },

  async lockUser(ctx: RequestContext, userId: string): Promise<void> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }
    if (actor.userId === userId) {
      throw new ValidationError("You cannot change your own access", {
        key: "errors.user_change_own_access_forbidden",
      });
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    if (target.systemRole === "ADMIN") {
      const adminCount = await userRepository.countAdmins(ctx.db);
      if (adminCount <= 1) {
        throw new ValidationError("At least one administrator is required", { key: "errors.user_at_least_one_admin" });
      }
    }

    const now = ctx.clock.now();
    await ctx.db.batch([
      userRepository.setStatusStmt(ctx.db, userId, "LOCKED", now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: actor.userId,
        action: "USER_LOCKED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes: { status: { from: target.status, to: "LOCKED" } },
        createdAt: now,
      }),
    ]);
  },

  async unlockUser(ctx: RequestContext, userId: string): Promise<void> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    const now = ctx.clock.now();
    await ctx.db.batch([
      userRepository.setStatusStmt(ctx.db, userId, "ACTIVE", now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: actor.userId,
        action: "USER_UNLOCKED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes: { status: { from: target.status, to: "ACTIVE" } },
        createdAt: now,
      }),
    ]);
  },

  async deleteUser(ctx: RequestContext, userId: string): Promise<void> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }
    if (actor.userId === userId) {
      throw new ValidationError("You cannot change your own access", {
        key: "errors.user_change_own_access_forbidden",
      });
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    if (target.systemRole === "ADMIN") {
      const adminCount = await userRepository.countAdmins(ctx.db);
      if (adminCount <= 1) {
        throw new ValidationError("At least one administrator is required", { key: "errors.user_at_least_one_admin" });
      }
    }

    const now = ctx.clock.now();
    await ctx.db.batch([
      userRepository.softDeleteStmt(ctx.db, userId, now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: actor.userId,
        action: "USER_DELETED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes: null,
        createdAt: now,
      }),
    ]);
  },

  async setSystemRole(ctx: RequestContext, userId: string, newRole: SystemRole): Promise<void> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }
    if (actor.userId === userId && newRole !== "ADMIN") {
      throw new ValidationError("You cannot change your own access", {
        key: "errors.user_change_own_access_forbidden",
      });
    }

    const target = await userRepository.findById(ctx.db, userId);
    if (!target) {
      throw new NotFoundError("User not found", { key: "errors.user_not_found" });
    }

    if (target.systemRole === "ADMIN" && newRole !== "ADMIN") {
      const adminCount = await userRepository.countAdmins(ctx.db);
      if (adminCount <= 1) {
        throw new ValidationError("At least one administrator is required", { key: "errors.user_at_least_one_admin" });
      }
    }

    const now = ctx.clock.now();
    await ctx.db.batch([
      userRepository.setSystemRoleStmt(ctx.db, userId, newRole, now),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, {
        id: crypto.randomUUID(),
        actorId: actor.userId,
        action: "USER_ROLE_CHANGED",
        entityType: "USER",
        entityId: userId,
        projectId: null,
        changes: { systemRole: { from: target.systemRole, to: newRole } },
        createdAt: now,
      }),
    ]);
  },

  async listUsers(ctx: RequestContext, filters?: UserFiltersInput): Promise<Page<UserAdminRow>> {
    const actor = getActorContext(ctx);
    if (!canManageUsers(actor)) {
      throw new ForbiddenError();
    }

    const parsedFilters = filters ? UserFiltersSchema.parse(filters) : undefined;
    const result = await userRepository.listUsers(ctx.db, parsedFilters);
    return {
      items: result.items.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        department: u.department,
        avatarKey: u.avatarKey,
        systemRole: u.systemRole,
        status: u.status,
        createdAt: u.createdAt.getTime(),
        updatedAt: u.updatedAt.getTime(),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  },
};
