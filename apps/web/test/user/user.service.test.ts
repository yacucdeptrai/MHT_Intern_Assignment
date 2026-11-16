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
      expect(audits[0]?.actorId).toBe(ctx.user?.id);
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

  describe("Additional edge cases and branch coverage", () => {
    it("throws ForbiddenError if actor is not in context", async () => {
      const ctx = await createMockContext("ADMIN");
      (ctx as unknown as { user: unknown }).user = null;
      await expect(userService.listUsers(ctx)).rejects.toThrow(ForbiddenError);
      await expect(
        userService.createUser(ctx, { fullName: "A", email: "a@b.com", systemRole: "MEMBER" }),
      ).rejects.toThrow(ForbiddenError);
      await expect(userService.updateUser(ctx, { userId: "some-id" })).rejects.toThrow(ForbiddenError);
    });

    it("creates user without department", async () => {
      const ctx = await createMockContext("ADMIN");
      const result = await userService.createUser(ctx, {
        fullName: "No Dept User",
        email: "nodept@example.com",
        systemRole: "MEMBER",
      });
      expect(result.user.department).toBeNull();
    });

    it("handles unlockUser successfully and errors on unknown target", async () => {
      const ctx = await createMockContext("ADMIN");
      const target = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "locked-target@example.com",
        fullName: "Locked Target",
        systemRole: "MEMBER",
        status: "LOCKED",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userService.unlockUser(ctx, target.id);
      const unlocked = await userRepository.findById(ctx.db, target.id);
      expect(unlocked?.status).toBe("ACTIVE");

      await expect(userService.unlockUser(ctx, "non-existent-id")).rejects.toThrow();
    });

    it("handles updateUser edge cases (department update, empty update, not found)", async () => {
      const ctx = await createMockContext("ADMIN");
      const target = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "update-edge@example.com",
        fullName: "Update Edge",
        department: "Old Dept",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update with same values (fullName, department, systemRole identical)
      const sameValues = await userService.updateUser(ctx, {
        userId: target.id,
        fullName: "Update Edge",
        department: "Old Dept",
        systemRole: "MEMBER",
      });
      expect(sameValues.id).toBe(target.id);

      // Update department to empty string (converts to null)
      const clearedDept = await userService.updateUser(ctx, {
        userId: target.id,
        department: "",
      });
      expect(clearedDept.department).toBeNull();

      // Update email to a new valid email address
      const newEmailUser = await userService.updateUser(ctx, {
        userId: target.id,
        email: "brand-new-email@example.com",
      });
      expect(newEmailUser.email).toBe("brand-new-email@example.com");

      // Update email to the exact same email address
      const sameEmailUser = await userService.updateUser(ctx, {
        userId: target.id,
        email: "brand-new-email@example.com",
      });
      expect(sameEmailUser.email).toBe("brand-new-email@example.com");

      // Update department and role
      const updated = await userService.updateUser(ctx, {
        userId: target.id,
        department: "New Dept",
        systemRole: "TEAM_LEAD",
      });
      expect(updated.department).toBe("New Dept");
      expect(updated.systemRole).toBe("TEAM_LEAD");

      // Empty update returns same user
      const unchanged = await userService.updateUser(ctx, {
        userId: target.id,
      });
      expect(unchanged.id).toBe(target.id);

      // Not found target
      await expect(userService.updateUser(ctx, { userId: "unknown-id" })).rejects.toThrow();
    });

    it("updates role and demotes an admin when another admin exists", async () => {
      const ctx = await createMockContext("ADMIN");
      // Add a second admin so there are 2 admins in DB
      const secondAdmin = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "second-admin@example.com",
        fullName: "Second Admin",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Now updateUser to demote secondAdmin to MEMBER
      const demoted = await userService.updateUser(ctx, {
        userId: secondAdmin.id,
        systemRole: "MEMBER",
      });
      expect(demoted.systemRole).toBe("MEMBER");

      // Promote member back to ADMIN
      const promoted = await userService.updateUser(ctx, {
        userId: secondAdmin.id,
        systemRole: "ADMIN",
      });
      expect(promoted.systemRole).toBe("ADMIN");

      // setSystemRole demoting secondAdmin
      await userService.setSystemRole(ctx, secondAdmin.id, "PM");
      const asPm = await userRepository.findById(ctx.db, secondAdmin.id);
      expect(asPm?.systemRole).toBe("PM");
    });

    it("locks and deletes an admin when another admin exists", async () => {
      const ctx = await createMockContext("ADMIN");
      const adminToLock = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "admin-to-lock@example.com",
        fullName: "Admin To Lock",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userService.lockUser(ctx, adminToLock.id);
      const locked = await userRepository.findById(ctx.db, adminToLock.id);
      expect(locked?.status).toBe("LOCKED");

      const adminToDelete = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "admin-to-delete@example.com",
        fullName: "Admin To Delete",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await userService.deleteUser(ctx, adminToDelete.id);
      const deleted = await userRepository.findById(ctx.db, adminToDelete.id);
      expect(deleted).toBeNull();
    });

    it("handles lock, delete, and setSystemRole errors on non-existent users", async () => {
      const ctx = await createMockContext("ADMIN");
      await expect(userService.lockUser(ctx, "unknown-id")).rejects.toThrow();
      await expect(userService.deleteUser(ctx, "unknown-id")).rejects.toThrow();
      await expect(userService.setSystemRole(ctx, "unknown-id", "PM")).rejects.toThrow();
    });

    it("protects last admin from being locked or deleted", async () => {
      const ctx = await createMockContext("ADMIN");
      const lastAdmin = await userRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        email: "last-admin-protect@example.com",
        fullName: "Last Admin Protect",
        systemRole: "ADMIN",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const allAdmins = await ctx.db.query.users.findMany({
        where: (u, { and, eq, isNull }) => and(eq(u.systemRole, "ADMIN"), isNull(u.deletedAt)),
      });
      for (const a of allAdmins) {
        if (a.id !== lastAdmin.id) {
          await userRepository.softDeleteStmt(ctx.db, a.id, new Date());
        }
      }

      await expect(userService.lockUser(ctx, lastAdmin.id)).rejects.toThrow("At least one administrator is required");
      await expect(userService.deleteUser(ctx, lastAdmin.id)).rejects.toThrow("At least one administrator is required");
    });

    it("lists users with various filters and pagination", async () => {
      const ctx = await createMockContext("ADMIN");
      // Call with no filters
      const all = await userService.listUsers(ctx);
      expect(all.items.length).toBeGreaterThanOrEqual(1);

      // Call with only status
      const activeList = await userService.listUsers(ctx, { status: "ACTIVE" });
      expect(activeList.items.length).toBeGreaterThanOrEqual(1);

      // Call with only systemRole
      const adminList = await userService.listUsers(ctx, { systemRole: "ADMIN" });
      expect(adminList.items.length).toBeGreaterThanOrEqual(1);

      // Call with only search query
      const queryList = await userService.listUsers(ctx, { q: "Admin" });
      expect(queryList.items.length).toBeGreaterThanOrEqual(1);

      // Call with pagination
      const paged = await userService.listUsers(ctx, { page: 1, pageSize: 2 });
      expect(paged.page).toBe(1);
      expect(paged.pageSize).toBe(2);

      // Non-admin calling listUsers
      const memberCtx = await createMockContext("MEMBER");
      await expect(userService.listUsers(memberCtx)).rejects.toThrow(ForbiddenError);
    });
  });
});
