import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/client";
import { auditLogs, invites, projects, users } from "../src/schema";

describe("projects, invites, and audit_logs schemas", () => {
  it("inserts valid project, invite, and audit_log", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const adminId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const inviteId = crypto.randomUUID();
    const auditId = crypto.randomUUID();

    // Insert user first (FK target)
    await db.insert(users).values({
      id: adminId,
      email: "admin@example.com",
      fullName: "Admin User",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    // Insert project
    await db.insert(projects).values({
      id: projectId,
      code: "PRJ-01",
      name: "Project 01",
      startDate: "2026-11-01",
      endDate: "2026-12-01",
      budget: 1000000,
      createdById: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // Insert invite
    await db.insert(invites).values({
      id: inviteId,
      email: "invitee@example.com",
      tokenHash: "abc123hash",
      userId: adminId,
      projectId: null,
      projectRole: null,
      invitedById: adminId,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
    });

    // Insert audit log
    await db.insert(auditLogs).values({
      id: auditId,
      actorId: adminId,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: adminId,
      projectId: null,
      changes: { email: { from: null, to: "admin@example.com" } },
      createdAt: now,
    });

    const insertedProject = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.id, projectId),
    });
    expect(insertedProject).toBeDefined();
    expect(insertedProject?.code).toBe("PRJ-01");

    const insertedInvite = await db.query.invites.findFirst({
      where: (i, { eq }) => eq(i.id, inviteId),
    });
    expect(insertedInvite).toBeDefined();
    expect(insertedInvite?.email).toBe("invitee@example.com");

    const insertedAudit = await db.query.auditLogs.findFirst({
      where: (a, { eq }) => eq(a.id, auditId),
    });
    expect(insertedAudit).toBeDefined();
    expect(insertedAudit?.action).toBe("USER_CREATED");
  });

  it("enforces project code uniqueness case-insensitively and date ordering", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const adminId = crypto.randomUUID();

    await db.insert(users).values({
      id: adminId,
      email: "creator@example.com",
      fullName: "Creator",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(projects).values({
      id: crypto.randomUUID(),
      code: "UNIQUE-01",
      name: "Unique One",
      startDate: "2026-11-01",
      endDate: "2026-11-10",
      createdById: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // Duplicate code with different case
    const duplicate = db.insert(projects).values({
      id: crypto.randomUUID(),
      code: "unique-01",
      name: "Unique Duplicate",
      startDate: "2026-11-01",
      endDate: "2026-11-10",
      createdById: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await expect(duplicate).rejects.toThrow();

    // Invalid date order: end before start
    const invalidDate = db.insert(projects).values({
      id: crypto.randomUUID(),
      code: "UNIQUE-02",
      name: "Bad Dates",
      startDate: "2026-11-10",
      endDate: "2026-11-01",
      createdById: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await expect(invalidDate).rejects.toThrow();
  });

  it("enforces invite project parity constraint", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const adminId = crypto.randomUUID();

    await db.insert(users).values({
      id: adminId,
      email: "inviter@example.com",
      fullName: "Inviter",
      createdAt: now,
      updatedAt: now,
    });

    // projectId null but projectRole present -> fails
    const invalidInvite = db.insert(invites).values({
      id: crypto.randomUUID(),
      email: "pending@example.com",
      tokenHash: "hash-invalid-parity",
      userId: null,
      projectId: null,
      projectRole: "MEMBER",
      invitedById: adminId,
      expiresAt: new Date(now.getTime() + 10000),
      createdAt: now,
    });
    await expect(invalidInvite).rejects.toThrow();
  });

  it("enforces audit log entityType check constraint (Lesson #13)", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const adminId = crypto.randomUUID();

    await db.insert(users).values({
      id: adminId,
      email: `audit-checker-${adminId}@example.com`,
      fullName: "Audit Checker",
      createdAt: now,
      updatedAt: now,
    });

    const invalidAudit = db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: adminId,
      action: "USER_CREATED",
      entityType: "INVALID_ENTITY" as unknown as typeof auditLogs.$inferInsert.entityType,
      entityId: adminId,
      createdAt: now,
    });
    await expect(invalidAudit).rejects.toThrow();
  });
});
