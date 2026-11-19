import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
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

describe("reportService.getProjectReport (FR-31)", () => {
  it("throws UnauthorizedError when not signed in", async () => {
    const ctx = createMockContext(null);
    await expect(reportService.getProjectReport(ctx, "proj-1")).rejects.toThrow(UnauthorizedError);
  });

  it("FR-31 c4: throws 403 ForbiddenError when a project TEAM_LEAD attempts to view project report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const leadId = crypto.randomUUID();
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await Promise.all([
      userRepository.insert(db, {
        id: leadId,
        email: `lead-proj-${Date.now()}@example.com`,
        fullName: "Team Lead",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: pmId,
        email: `pm-proj-${Date.now()}@example.com`,
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
        name: "Lead Forbidden Project",
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
        userId: leadId,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
    ]);

    const ctx = createMockContext(
      { id: leadId, systemRole: "MEMBER", email: "lead@example.com", fullName: "Team Lead User", status: "ACTIVE" },
      now,
    );

    await expect(reportService.getProjectReport(ctx, projectId)).rejects.toThrow(ForbiddenError);
  });

  it("FR-31 c4: throws 403 ForbiddenError when a project MEMBER attempts to view project report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const memberId = crypto.randomUUID();
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await Promise.all([
      userRepository.insert(db, {
        id: memberId,
        email: `member-proj-${Date.now()}@example.com`,
        fullName: "Regular Member",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: pmId,
        email: `pm-proj2-${Date.now()}@example.com`,
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
        name: "Member Forbidden Project",
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
      { id: memberId, systemRole: "MEMBER", email: "member@example.com", fullName: "Member User", status: "ACTIVE" },
      now,
    );

    await expect(reportService.getProjectReport(ctx, projectId)).rejects.toThrow(ForbiddenError);
  });

  it("P3: throws 404 NotFoundError when non-member views project report", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const nonMemberId = crypto.randomUUID();
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await Promise.all([
      userRepository.insert(db, {
        id: nonMemberId,
        email: `nonmember-proj-${Date.now()}@example.com`,
        fullName: "Non-member User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: pmId,
        email: `pm-proj3-${Date.now()}@example.com`,
        fullName: "PM User 3",
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
        name: "Non-member Project",
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

    await expect(reportService.getProjectReport(ctx, projectId)).rejects.toThrow(NotFoundError);
  });

  it("FR-31 c1–3: project PM receives project report with completion, distribution, sprint completion (P11), and bottlenecks", async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const pmId = crypto.randomUUID();
    const db = createDatabase(env.DB);

    await userRepository.insert(db, {
      id: pmId,
      email: `pm-allowed-${Date.now()}@example.com`,
      fullName: "PM Allowed",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Project Progress Report",
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
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: "To Do",
        category: "TODO",
        position: 1,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: "Done",
        category: "DONE",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const task1 = crypto.randomUUID();
    const task2 = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: task1,
        projectId,
        statusId: statusTodoId,
        title: "Task One",
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2,
        projectId,
        statusId: statusDoneId,
        title: "Task Two",
        createdById: pmId,
        statusChangedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const ctx = createMockContext(
      { id: pmId, systemRole: "MEMBER", email: "pm@example.com", fullName: "PM Allowed", status: "ACTIVE" },
      now,
    );

    const report = await reportService.getProjectReport(ctx, projectId);
    expect(report.totalTasks).toBe(2);
    expect(report.doneTasks).toBe(1);
    expect(report.completionRate).toBe(50);
    const todoDist = report.statusDistribution.find((s) => s.statusId === statusTodoId);
    const doneDist = report.statusDistribution.find((s) => s.statusId === statusDoneId);
    expect(todoDist?.taskCount).toBe(1);
    expect(todoDist?.percentage).toBe(50);
    expect(doneDist?.taskCount).toBe(1);
    expect(doneDist?.percentage).toBe(50);
    expect(report.bottlenecks).toBeDefined();
    expect(report.sprintCompletion).toBeDefined();
  });
  it('FR-31 c2: a sprint with no top-level tasks reports completion as null (shown as "No tasks"), not 0%', async () => {
    const now = new Date("2026-11-19T10:00:00+07:00");
    const db = createDatabase(env.DB);
    const pmId = crypto.randomUUID();
    await userRepository.insert(db, {
      id: pmId,
      email: `pm-c2-${pmId}@example.com`,
      fullName: "PM Sprint Report",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const todoId = crypto.randomUUID();
    const doneId = crypto.randomUUID();
    const emptySprintId = crypto.randomUUID();
    const busySprintId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `C2${projectId.slice(0, 6).toUpperCase()}`,
        name: "Sprint Completion Report",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pmId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, { projectId, userId: pmId, projectRole: "PM", createdAt: now }),
      taskStatusRepository.insertStmt(db, {
        id: todoId,
        name: `To Do ${todoId}`,
        category: "TODO",
        position: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: doneId,
        name: `Done ${doneId}`,
        category: "DONE",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    await sprintRepository.insert(db, {
      id: emptySprintId,
      projectId,
      name: "Empty sprint",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: now,
      updatedAt: now,
    });
    await sprintRepository.insert(db, {
      id: busySprintId,
      projectId,
      name: "Busy sprint",
      startDate: "2026-11-15",
      endDate: "2026-11-28",
      createdAt: now,
      updatedAt: now,
    });
    await db.batch([
      taskRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        projectId,
        sprintId: busySprintId,
        statusId: doneId,
        title: "Done in busy sprint",
        createdById: pmId,
        statusChangedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: crypto.randomUUID(),
        projectId,
        sprintId: busySprintId,
        statusId: todoId,
        title: "Open in busy sprint",
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const ctx = createMockContext(
      { id: pmId, systemRole: "MEMBER", email: "pm-c2@example.com", fullName: "PM Sprint Report", status: "ACTIVE" },
      now,
    );
    const report = await reportService.getProjectReport(ctx, projectId);

    const empty = report.sprintCompletion.find((sprint) => sprint.id === emptySprintId);
    const busy = report.sprintCompletion.find((sprint) => sprint.id === busySprintId);
    expect(empty).toBeDefined();
    expect(empty?.completionRate).toBeNull();
    expect(busy?.completionRate).toBe(50);
  });
});
