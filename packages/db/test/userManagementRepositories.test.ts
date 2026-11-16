import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { conflictGuardStmt } from "../src/batch";
import { createDatabase } from "../src/client";
import { auditLogRepository, inviteRepository, userRepository } from "../src/index";

describe("User management repositories", () => {
  it("creates an invite and retrieves by tokenHash", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const admin = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "inviter-repo@example.com",
      fullName: "Inviter Repo",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const inviteId = crypto.randomUUID();
    const tokenHash = "sha256-hash-value-123";

    await db.batch([
      inviteRepository.insertStmt(db, {
        id: inviteId,
        email: "invited-user@example.com",
        tokenHash,
        userId: admin.id,
        projectId: null,
        projectRole: null,
        invitedById: admin.id,
        expiresAt: new Date(now.getTime() + 100000),
        createdAt: now,
      }),
    ]);

    const found = await inviteRepository.findByTokenHash(db, tokenHash);
    expect(found).toBeDefined();
    expect(found?.id).toBe(inviteId);
    expect(found?.email).toBe("invited-user@example.com");
  });

  it("inserts and lists audit log entries", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const admin = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "audit-admin@example.com",
      fullName: "Audit Admin",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const auditId = crypto.randomUUID();
    await db.batch([
      auditLogRepository.insertStmt(db, {
        id: auditId,
        actorId: admin.id,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: admin.id,
        projectId: null,
        changes: { status: { from: null, to: "ACTIVE" } },
        createdAt: now,
      }),
    ]);

    const entries = await auditLogRepository.listByEntity(db, "USER", admin.id);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.id === auditId && e.action === "USER_CREATED")).toBe(true);
  });

  it("updates user, changes status, soft-deletes, and guards against deleted targets", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "target-user@example.com",
      fullName: "Target User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    // A10: Update with guard
    await db.batch([
      userRepository.updateStmt(db, user.id, { fullName: "Target Renamed", updatedAt: now }),
      conflictGuardStmt(db),
      auditLogRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        actorId: user.id,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: user.id,
        projectId: null,
        changes: { fullName: { from: "Target User", to: "Target Renamed" } },
        createdAt: now,
      }),
    ]);

    const updated = await userRepository.findById(db, user.id);
    expect(updated?.fullName).toBe("Target Renamed");

    // A10: Set status (lock) with guard
    await db.batch([userRepository.setStatusStmt(db, user.id, "LOCKED", now), conflictGuardStmt(db)]);
    const locked = await userRepository.findById(db, user.id);
    expect(locked?.status).toBe("LOCKED");

    // A10: Soft delete with guard
    await db.batch([userRepository.softDeleteStmt(db, user.id, now), conflictGuardStmt(db)]);
    const deleted = await userRepository.findById(db, user.id);
    expect(deleted).toBeNull(); // findById filters deleted by default

    const deletedWithOpt = await userRepository.findById(db, user.id, { includeDeleted: true });
    expect(deletedWithOpt?.deletedAt).toBeDefined();

    // Updating a deleted user must trigger conflictGuardStmt failure
    const updateDeletedBatch = db.batch([
      userRepository.updateStmt(db, user.id, { fullName: "Cannot Update", updatedAt: now }),
      conflictGuardStmt(db),
    ]);
    await expect(updateDeletedBatch).rejects.toThrow();
  });

  it("counts active admins and lists users with pagination & search", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();

    const admin1 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "admin-count-1@example.com",
      fullName: "Admin Count One",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const _admin2 = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "admin-count-2@example.com",
      fullName: "Admin Count Two",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const adminCount = await userRepository.countAdmins(db);
    expect(adminCount).toBeGreaterThanOrEqual(2);

    const listResult = await userRepository.listUsers(db, {
      q: "Admin Count One",
      page: 1,
      pageSize: 10,
    });

    expect(listResult.total).toBe(1);
    expect(listResult.items[0]?.id).toBe(admin1.id);
  });

  it("inserts directly via inviteRepository and auditLogRepository", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const admin = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "direct-repo@example.com",
      fullName: "Direct Repo",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const invite = await inviteRepository.insert(db, {
      id: crypto.randomUUID(),
      email: "direct-invitee@example.com",
      tokenHash: "direct-hash",
      userId: admin.id,
      projectId: null,
      projectRole: null,
      invitedById: admin.id,
      expiresAt: new Date(now.getTime() + 10000),
      createdAt: now,
    });
    expect(invite.email).toBe("direct-invitee@example.com");

    const audit = await auditLogRepository.insert(db, {
      id: crypto.randomUUID(),
      actorId: admin.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: admin.id,
      projectId: null,
      changes: null,
      createdAt: now,
    });
    expect(audit.action).toBe("USER_CREATED");
  });
});
