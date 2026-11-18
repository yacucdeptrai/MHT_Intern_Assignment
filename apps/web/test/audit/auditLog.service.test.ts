import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  auditLogRepository,
  compactBatch,
  conflictGuardStmt,
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@pm/domain";

import { auditLogService } from "../../app/services/auditLog.service";
import { taskService } from "../../app/services/task.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createActorCtx(
  systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
  fixedNow?: Date,
): Promise<{ ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = fixedNow ?? new Date();
  const userId = crypto.randomUUID();

  const user = await userRepository.insert(db, {
    id: userId,
    email: `audit-svc-${systemRole.toLowerCase()}-${crypto.randomUUID()}@example.com`,
    fullName: `User ${systemRole}`,
    systemRole,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    db,
    env: { APP_BASE_URL: "http://localhost:5173" } as unknown as Cloudflare.Env,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "audit-svc-test",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => fixedNow ?? new Date() },
  };

  return { ctx, userId };
}

describe("auditLogService (FR-24 c1, c2, c4)", () => {
  it("FR-24 c1: audited actions record actor, action, entityType, entityId, before/after JSON changes, and timestamp", async () => {
    const fixedTime = new Date("2026-11-18T08:00:00.000Z");
    const { ctx: adminCtx, userId: adminId } = await createActorCtx("ADMIN", fixedTime);

    const projectId = crypto.randomUUID();
    const todoId = crypto.randomUUID();
    const reviewId = crypto.randomUUID();

    await adminCtx.db.batch([
      projectRepository.insertStmt(adminCtx.db, {
        id: projectId,
        code: `AD${projectId.slice(0, 6).toUpperCase()}`,
        name: "Audited Project",
        status: "ACTIVE",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        createdById: adminId,
        createdAt: fixedTime,
        updatedAt: fixedTime,
      }),
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminId,
        projectRole: "PM",
        createdAt: fixedTime,
      }),
      taskStatusRepository.insertStmt(adminCtx.db, {
        id: todoId,
        name: `Todo ${todoId.slice(0, 6)}`,
        category: "TODO",
        position: 1,
        isDefault: true,
        createdAt: fixedTime,
        updatedAt: fixedTime,
      }),
      taskStatusRepository.insertStmt(adminCtx.db, {
        id: reviewId,
        name: `Review ${reviewId.slice(0, 6)}`,
        category: "REVIEW",
        position: 2,
        isDefault: true,
        createdAt: fixedTime,
        updatedAt: fixedTime,
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Audited Task",
      priority: "HIGH",
    });

    await taskService.updateTask(adminCtx, projectId, task.id, {
      title: "Audited Task v2",
      version: 1,
    });

    const result = await auditLogService.listSystemAuditLogs(adminCtx, {
      actorId: adminId,
      entityType: "TASK",
    });

    const createdEntry = result.entries.items.find((e) => e.entityId === task.id && e.action === "TASK_CREATED");
    const updatedEntry = result.entries.items.find((e) => e.entityId === task.id && e.action === "TASK_UPDATED");

    expect(createdEntry).toBeDefined();
    expect(createdEntry?.actorId).toBe(adminId);
    expect(createdEntry?.entityType).toBe("TASK");
    expect(createdEntry?.entityId).toBe(task.id);
    expect(createdEntry?.changes?.title).toEqual({ from: null, to: "Audited Task" });
    expect(createdEntry?.changes?.priority).toEqual({ from: null, to: "HIGH" });
    expect(createdEntry?.createdAt).toBe(fixedTime.getTime());

    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.changes?.title).toEqual({ from: "Audited Task", to: "Audited Task v2" });
  });

  it("FR-24 c2 & FR-03 c4: Admin filters audit log by actor, entity type, action, and date range, newest first, 50 per page, showing 'Deleted user' for deleted actors", async () => {
    const { ctx: adminCtx, userId: adminId } = await createActorCtx("ADMIN");
    const { userId: deletedUserId } = await createActorCtx("MEMBER");

    // Day 1 in Asia/Ho_Chi_Minh: 2026-11-12T10:00:00+07:00 = 2026-11-12T03:00:00Z
    const day1 = new Date("2026-11-12T03:00:00.000Z");
    // Day 2 in Asia/Ho_Chi_Minh: 2026-11-18T15:00:00+07:00 = 2026-11-18T08:00:00Z
    const day2 = new Date("2026-11-18T08:00:00.000Z");

    const inserts = [];
    for (let i = 0; i < 52; i++) {
      inserts.push(
        auditLogRepository.insertStmt(adminCtx.db, {
          id: crypto.randomUUID(),
          actorId: adminId,
          action: "STATUS_UPDATED",
          entityType: "STATUS",
          entityId: `status-${i}`,
          projectId: null,
          changes: { position: { from: i, to: i + 1 } },
          createdAt: new Date(day1.getTime() + i * 1000),
        }),
      );
    }

    const deletedActorAuditId = crypto.randomUUID();
    inserts.push(
      auditLogRepository.insertStmt(adminCtx.db, {
        id: deletedActorAuditId,
        actorId: deletedUserId,
        action: "USER_UPDATED",
        entityType: "USER",
        entityId: deletedUserId,
        projectId: null,
        changes: { phone: { from: null, to: "0900000000" } },
        createdAt: day2,
      }),
    );

    await adminCtx.db.batch(
      compactBatch([
        ...inserts,
        userRepository.softDeleteStmt(adminCtx.db, deletedUserId, day2),
        conflictGuardStmt(adminCtx.db),
      ]),
    );

    // Filter by adminId -> 52 rows, 50 per page, newest first
    const page1 = await auditLogService.listSystemAuditLogs(adminCtx, {
      actorId: adminId,
    });
    expect(page1.entries.pageSize).toBe(50);
    expect(page1.entries.page).toBe(1);
    expect(page1.entries.total).toBe(52);
    expect(page1.entries.items).toHaveLength(50);
    expect(page1.entries.items[0]?.createdAt).toBeGreaterThan(page1.entries.items[49]?.createdAt ?? 0);

    // Filter by deleted actor + date range + action + entityType
    const filtered = await auditLogService.listSystemAuditLogs(adminCtx, {
      actorId: deletedUserId,
      entityType: "USER",
      action: "USER_UPDATED",
      from: "2026-11-18",
      to: "2026-11-18",
    });
    expect(filtered.entries.total).toBe(1);
    expect(filtered.entries.items[0]?.id).toBe(deletedActorAuditId);
    expect(filtered.entries.items[0]?.actorName).toBe("Deleted user");
  });

  it("FR-24 c4: rejects non-Admin (PM, TEAM_LEAD, MEMBER) with 403 and unauthenticated callers with 401", async () => {
    for (const role of ["PM", "TEAM_LEAD", "MEMBER"] as const) {
      const { ctx } = await createActorCtx(role);
      await expect(auditLogService.listSystemAuditLogs(ctx, {})).rejects.toThrow(ForbiddenError);
    }

    const { ctx: adminCtx } = await createActorCtx("ADMIN");
    const anonCtx: RequestContext = { ...adminCtx, user: null };
    await expect(auditLogService.listSystemAuditLogs(anonCtx, {})).rejects.toThrow(UnauthorizedError);
  });

  it("FR-24 c2: rejects invalid filter parameters with ValidationError (400)", async () => {
    const { ctx: adminCtx } = await createActorCtx("ADMIN");
    await expect(
      auditLogService.listSystemAuditLogs(adminCtx, {
        from: "2026-11-20",
        to: "2026-11-10",
      }),
    ).rejects.toThrow(ValidationError);
  });
});
