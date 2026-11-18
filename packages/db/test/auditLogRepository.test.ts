import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getEndOfDayMs, getStartOfDayMs } from "@pm/domain";

import {
  auditLogRepository,
  compactBatch,
  conflictGuardStmt,
  createDatabase,
  projectRepository,
  userRepository,
} from "../src";

interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

describe("auditLogRepository (FR-24, FR-03 c4, docs/03 §audit_logs)", () => {
  it("FR-24 c3 & FR-03 c4: listByEntityWithActor returns rows newest first, maps soft-deleted actor to 'Deleted user', and null actor to 'System'", async () => {
    const db = createDatabase(env.DB);
    const baseMs = Date.UTC(2026, 10, 18, 3, 0, 0);

    const activeUser = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `audit-active-${crypto.randomUUID()}@example.com`,
      fullName: "Active Lead",
      systemRole: "TEAM_LEAD",
      status: "ACTIVE",
      createdAt: new Date(baseMs),
      updatedAt: new Date(baseMs),
    });

    const deletedUser = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `audit-deleted-${crypto.randomUUID()}@example.com`,
      fullName: "Former Member",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: new Date(baseMs),
      updatedAt: new Date(baseMs),
    });

    await db.batch([userRepository.softDeleteStmt(db, deletedUser.id, new Date(baseMs + 500)), conflictGuardStmt(db)]);

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `AU${projectId.slice(0, 6).toUpperCase()}`,
        name: "Audit History Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: activeUser.id,
        createdAt: new Date(baseMs),
        updatedAt: new Date(baseMs),
      }),
    ]);

    const taskId = crypto.randomUUID();

    await db.batch([
      auditLogRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        actorId: deletedUser.id,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes: { title: { from: null, to: "Initial title" } },
        createdAt: new Date(baseMs + 1000),
      }),
      auditLogRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        actorId: null,
        action: "TASK_UPDATED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes: { sprintId: { from: "s1", to: null } },
        createdAt: new Date(baseMs + 2000),
      }),
      auditLogRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        actorId: activeUser.id,
        action: "TASK_REJECTED",
        entityType: "TASK",
        entityId: taskId,
        projectId,
        changes: {
          statusName: { from: "In Review", to: "In Progress" },
          reason: { from: null, to: "Missing regression test" },
        },
        createdAt: new Date(baseMs + 3000),
      }),
    ]);

    const history = await auditLogRepository.listByEntityWithActor(db, "TASK", taskId);
    expect(history).toHaveLength(3);
    expect(history.map((row) => row.action)).toEqual(["TASK_REJECTED", "TASK_UPDATED", "TASK_CREATED"]);
    expect(history[0]?.actorName).toBe("Active Lead");
    expect(history[0]?.changes?.reason?.to).toBe("Missing regression test");
    expect(history[1]?.actorName).toBe("System");
    expect(history[2]?.actorName).toBe("Deleted user");
  });

  it("FR-24 c2: listSystemLogs filters by actorId, entityType, action, and date range, newest first, 50 per page", async () => {
    const db = createDatabase(env.DB);
    const day1Ms = getStartOfDayMs("2026-11-10") + 3600_000;
    const day2Ms = getStartOfDayMs("2026-11-15") + 3600_000;

    const actorA = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `actor-a-${crypto.randomUUID()}@example.com`,
      fullName: "Actor Alpha",
      systemRole: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date(day1Ms),
      updatedAt: new Date(day1Ms),
    });

    const actorB = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `actor-b-${crypto.randomUUID()}@example.com`,
      fullName: "Actor Beta",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: new Date(day1Ms),
      updatedAt: new Date(day1Ms),
    });

    const stmts = [];
    for (let i = 0; i < 55; i++) {
      stmts.push(
        auditLogRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          actorId: actorA.id,
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: actorA.id,
          projectId: null,
          changes: { step: { from: i, to: i + 1 } },
          createdAt: new Date(day1Ms + i * 1000),
        }),
      );
    }

    const specialEntityId = crypto.randomUUID();
    stmts.push(
      auditLogRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        actorId: actorB.id,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: specialEntityId,
        projectId: null,
        changes: { name: { from: null, to: "Beta Project" } },
        createdAt: new Date(day2Ms),
      }),
    );

    await db.batch(compactBatch(stmts));

    // Filter by actorA -> 55 entries, default 50 per page, newest first
    const page1 = await auditLogRepository.listSystemLogs(db, {
      actorId: actorA.id,
    });
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(50);
    expect(page1.total).toBe(55);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(50);
    expect(page1.items[0]?.createdAt).toBeGreaterThan(page1.items[49]?.createdAt ?? 0);

    const page2 = await auditLogRepository.listSystemLogs(db, {
      actorId: actorA.id,
      page: 2,
    });
    expect(page2.items).toHaveLength(5);

    // Filter by actorB + entityType + action + date range
    const filtered = await auditLogRepository.listSystemLogs(db, {
      actorId: actorB.id,
      entityType: "PROJECT",
      action: "PROJECT_CREATED",
      fromMs: getStartOfDayMs("2026-11-15"),
      toMs: getEndOfDayMs("2026-11-15"),
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.entityId).toBe(specialEntityId);
    expect(filtered.items[0]?.actorName).toBe("Actor Beta");

    // Out-of-range date filter returns 0
    const emptyDateRange = await auditLogRepository.listSystemLogs(db, {
      actorId: actorB.id,
      fromMs: getStartOfDayMs("2026-11-16"),
      toMs: getEndOfDayMs("2026-11-16"),
    });
    expect(emptyDateRange.total).toBe(0);
    expect(emptyDateRange.items).toHaveLength(0);

    // listActors includes active and soft-deleted actors
    const actors = await auditLogRepository.listActors(db);
    expect(actors.some((a) => a.id === actorA.id && a.fullName === "Actor Alpha")).toBe(true);
  });

  it("docs/03 §audit_logs: uses idx_audit_entity for entity history and idx_audit_created for system timeline", async () => {
    const db = createDatabase(env.DB);

    const entityPlan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN SELECT id FROM audit_logs WHERE entity_type = 'TASK' AND entity_id = 'task-1' ORDER BY created_at DESC`,
    );
    expect(entityPlan.map((r) => r.detail).join(" ")).toContain("idx_audit_entity");

    const timelinePlan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN SELECT id FROM audit_logs WHERE created_at >= 1700000000000 ORDER BY created_at DESC LIMIT 50`,
    );
    expect(timelinePlan.map((r) => r.detail).join(" ")).toContain("idx_audit_created");
  });
});
