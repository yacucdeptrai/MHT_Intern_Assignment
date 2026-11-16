import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, inviteRepository, userRepository } from "@pm/db";
import { ForbiddenError, ValidationError } from "@pm/domain";
import { userService } from "../../app/services/user/user.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createMockContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "ADMIN",
  actorId?: string,
): Promise<RequestContext> {
  const id = actorId ?? crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}@example.com`;
  const fullName = `${role} User`;

  await userRepository.insert(db, {
    id,
    email,
    fullName,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  return {
    env,
    db,
    user: {
      id,
      email,
      fullName,
      systemRole: role,
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

describe("userService", () => {
  describe("FR-03 criterion 1 & A9: Create user with invite and audit log", () => {
    it("creates active user, invite link, and audits USER_CREATED in atomic batch", async () => {
      const ctx = await createMockContext("ADMIN");

      const result = await userService.createUser(ctx, {
        fullName: "New Engineer",
        email: "  New.Engineer@Example.COM  ",
        systemRole: "MEMBER",
        department: "Core Dev",
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe("new.engineer@example.com");
      expect(result.user.status).toBe("ACTIVE");
      expect(result.user.department).toBe("Core Dev");
      expect(result.inviteToken).toBeDefined();
      expect(result.inviteUrl).toContain("/invite/");

      // Verify DB user record
      const dbUser = await userRepository.findById(ctx.db, result.user.id);
      expect(dbUser).toBeDefined();
      expect(dbUser?.status).toBe("ACTIVE");

      // Verify invite record with token_hash
      const invite = await inviteRepository.findById(ctx.db, result.inviteId);
      expect(invite).toBeDefined();
      expect(invite?.email).toBe("new.engineer@example.com");
      expect(invite?.tokenHash).toBeDefined();

      // Verify audit log record
      const audits = await auditLogRepository.listByEntity(ctx.db, "USER", result.user.id);
      expect(audits.length).toBe(1);
      expect(audits[0]?.action).toBe("USER_CREATED");
      expect(audits[0]?.actorId).toBe(ctx.user!.id);
    });
  });

  describe("FR-03 criterion 2: Duplicate email validation", () => {
    it("returns 400 field error when email is already in use (create)", async () => {
      const ctx = await createMockContext("ADMIN");
      await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "existing@example.com",
        fullName: "Existing",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        userService.createUser(ctx, {
          fullName: "Another",
          email: "EXISTING@example.com",
          systemRole: "PM",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("returns 400 field error when email is already in use (update)", async () => {
      const ctx = await createMockContext("ADMIN");
      const userA = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "usera@example.com",
        fullName: "User A",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "userb@example.com",
        fullName: "User B",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        userService.updateUser(ctx, {
          userId: userA.id,
          email: "USERB@example.com",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("FR-03 criterion 3 & A10: Lock user and audit USER_LOCKED", () => {
    it("locks user and audits USER_LOCKED with version guard", async () => {
      const ctx = await createMockContext("ADMIN");
      const target = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "to-lock@example.com",
        fullName: "To Lock",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userService.lockUser(ctx, target.id);

      const dbUser = await userRepository.findById(ctx.db, target.id);
      expect(dbUser?.status).toBe("LOCKED");

      const audits = await auditLogRepository.listByEntity(ctx.db, "USER", target.id);
      expect(audits.some((a) => a.action === "USER_LOCKED")).toBe(true);
    });
  });

  describe("FR-03 criterion 4 & A10: Soft-delete user and audit USER_DELETED", () => {
    it("soft-deletes user and audits USER_DELETED with version guard", async () => {
      const ctx = await createMockContext("ADMIN");
      const target = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "to-delete@example.com",
        fullName: "To Delete",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userService.deleteUser(ctx, target.id);

      const dbUser = await userRepository.findById(ctx.db, target.id);
      expect(dbUser).toBeNull(); // Default filters deleted

      const deletedRecord = await userRepository.findById(ctx.db, target.id, { includeDeleted: true });
      expect(deletedRecord?.deletedAt).toBeDefined();

      const audits = await auditLogRepository.listByEntity(ctx.db, "USER", target.id);
      expect(audits.some((a) => a.action === "USER_DELETED")).toBe(true);
    });
  });

  describe("FR-03 criterion 5: No self-lockout rules", () => {
    it("rejects admin attempting to lock self", async () => {
      const adminId = crypto.randomUUID();
      const ctx = await createMockContext("ADMIN", adminId);

      await expect(userService.lockUser(ctx, adminId)).rejects.toThrow("You cannot change your own access");
    });

    it("rejects admin attempting to delete self", async () => {
      const adminId = crypto.randomUUID();
      const ctx = await createMockContext("ADMIN", adminId);

      await expect(userService.deleteUser(ctx, adminId)).rejects.toThrow("You cannot change your own access");
    });

    it("rejects admin attempting to demote self", async () => {
      const adminId = crypto.randomUUID();
      const ctx = await createMockContext("ADMIN", adminId);

      await expect(userService.setSystemRole(ctx, adminId, "MEMBER")).rejects.toThrow(
        "You cannot change your own access",
      );
    });
  });

  describe("FR-03 criterion 6: Non-admin permission checks", () => {
    it("rejects PM, TEAM_LEAD, and MEMBER with 403 ForbiddenError", async () => {
      const pmCtx = await createMockContext("PM");
      await expect(
        userService.createUser(pmCtx, {
          fullName: "Attempt",
          email: "attempt@example.com",
          systemRole: "MEMBER",
        }),
      ).rejects.toThrow(ForbiddenError);

      const leadCtx = await createMockContext("TEAM_LEAD");
      await expect(userService.lockUser(leadCtx, "some-id")).rejects.toThrow(ForbiddenError);

      const memberCtx = await createMockContext("MEMBER");
      await expect(userService.deleteUser(memberCtx, "some-id")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Last Admin demotion protection (FR-04 criterion 2)", () => {
    it("rejects demoting the only remaining admin", async () => {
      const ctx = await createMockContext("ADMIN");
      const targetAdmin = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "target-last-admin@example.com",
        fullName: "Target Last Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Soft-delete any other admin in DB to leave exactly 1 admin
      const allAdmins = await ctx.db.query.users.findMany({
        where: (u, { and, eq, isNull }) => and(eq(u.systemRole, "ADMIN"), isNull(u.deletedAt)),
      });
      for (const a of allAdmins) {
        if (a.id !== targetAdmin.id) {
          await userRepository.softDeleteStmt(ctx.db, a.id, new Date());
        }
      }

      const count = await userRepository.countAdmins(ctx.db);
      expect(count).toBe(1);

      await expect(userService.setSystemRole(ctx, targetAdmin.id, "MEMBER")).rejects.toThrow(
        "At least one administrator is required",
      );
    });
  });
});
