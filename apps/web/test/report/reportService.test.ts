import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@pm/domain";

import { reportService } from "../../app/services/report.service";
import type { SessionUser } from "../../app/utils/auth.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

function createMockContext(
  user: SessionUser | null = null,
  now: Date = new Date("2026-11-19T10:00:00+07:00"),
): RequestContext {
  const db = createDatabase(env.DB);
  return {
    env,
    db,
    user,
    requestId: "report-test",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => now },
  };
}

describe("reportService.getMemberReport (FR-30)", () => {
  it("throws UnauthorizedError when not signed in", async () => {
    const ctx = createMockContext(null);
    await expect(reportService.getMemberReport(ctx, "proj-1", {})).rejects.toThrow(UnauthorizedError);
  });

  it("FR-30 c2: throws 403 ForbiddenError when a project MEMBER attempts to view member report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const memberId = crypto.randomUUID();
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await Promise.all([
      userRepository.insert(db, {
        id: memberId,
        email: `member-${Date.now()}@example.com`,
        fullName: "Regular Member",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: pmId,
        email: `pm-${Date.now()}@example.com`,
        fullName: "PM User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Forbidden Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pmId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pmId,
        projectRole: "PM",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: memberId,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const ctx = createMockContext(
      { id: memberId, systemRole: "MEMBER", email: "member@example.com", fullName: "Regular Member", status: "ACTIVE" },
      now,
    );

    await expect(reportService.getMemberReport(ctx, projectId, {})).rejects.toThrow(ForbiddenError);
  });

  it("P3: throws 404 NotFoundError when a non-member attempts to view member report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const nonMemberId = crypto.randomUUID();
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await Promise.all([
      userRepository.insert(db, {
        id: nonMemberId,
        email: `nonmember-${Date.now()}@example.com`,
        fullName: "Non-member User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: pmId,
        email: `pm-${Date.now()}@example.com`,
        fullName: "PM User 2",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Private Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pmId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pmId,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const ctx = createMockContext(
      { id: nonMemberId, systemRole: "MEMBER", email: "non@example.com", fullName: "Non Member", status: "ACTIVE" },
      now,
    );

    await expect(reportService.getMemberReport(ctx, projectId, {})).rejects.toThrow(NotFoundError);
  });

  it("FR-30 c1: allows TEAM_LEAD, PM, or ADMIN to retrieve member report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const leadId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await userRepository.insert(db, {
      id: leadId,
      email: `lead-${Date.now()}@example.com`,
      fullName: "Team Lead User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Lead Report Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: leadId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: leadId,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId,
        name: `Status-${crypto.randomUUID().slice(0, 5)}`,
        category: "IN_PROGRESS",
        isDefault: true,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId,
        statusId,
        title: "Assigned Task",
        dueDate: "2026-11-25",
        createdById: leadId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [leadId], now),
    ]);

    const ctx = createMockContext(
      { id: leadId, systemRole: "MEMBER", email: "lead@example.com", fullName: "Team Lead User", status: "ACTIVE" },
      now,
    );

    const report = await reportService.getMemberReport(ctx, projectId, {});
    expect(report.length).toBe(1);
    expect(report[0]?.userId).toBe(leadId);
    expect(report[0]?.inProgressCount).toBe(1);
    expect(report[0]?.totalAssigned).toBe(1);
  });
});
