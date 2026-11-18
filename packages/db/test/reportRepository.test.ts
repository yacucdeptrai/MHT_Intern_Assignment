import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  reportRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src";

interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

describe("reportRepository.getMemberReport (FR-30 c1)", () => {
  it("FR-30 c1: EXPLAIN QUERY PLAN shows index use for member report aggregation", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN
          SELECT 
            pm.user_id as userId,
            u.full_name as fullName,
            u.email as email,
            pm.project_role as projectRole,
            COUNT(t.id) as totalAssigned
          FROM project_members pm
          INNER JOIN users u ON u.id = pm.user_id
          LEFT JOIN task_assignees ta ON ta.user_id = pm.user_id
          LEFT JOIN tasks t ON t.id = ta.task_id AND t.project_id = 'p1' AND t.deleted_at IS NULL
          WHERE pm.project_id = 'p1'
          GROUP BY pm.user_id, u.full_name, u.email, pm.project_role
          ORDER BY pm.project_role ASC, u.full_name ASC`,
    );

    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("idx_task_assignees_user");
  });

  it("FR-30 c1: aggregates member task counts by category, overdue count, and completed in range in one SQL query", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T10:00:00+07:00");
    const todayStr = "2026-11-19";

    const pmId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    const memberWithNoTasksId = crypto.randomUUID();

    await Promise.all([
      userRepository.insert(db, {
        id: pmId,
        email: `pm-${Date.now()}@example.com`,
        fullName: "Project Manager",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: leadId,
        email: `lead-${Date.now()}@example.com`,
        fullName: "Team Lead",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: memberWithNoTasksId,
        email: `empty-${Date.now()}@example.com`,
        fullName: "Zero Tasks Member",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectId = crypto.randomUUID();
    const sprintId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();
    const statusInProgressId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Report Test Project",
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
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: memberWithNoTasksId,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      sprintRepository.insertStmt(db, {
        id: sprintId,
        projectId,
        name: "Sprint 1",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `Todo-${crypto.randomUUID().slice(0, 5)}`,
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusInProgressId,
        name: `Prog-${crypto.randomUUID().slice(0, 5)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 2,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `Done-${crypto.randomUUID().slice(0, 5)}`,
        category: "DONE",
        isDefault: false,
        position: 3,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Tasks for leadId:
    // 1 Todo task (overdue: due 2026-11-15 < today 2026-11-19)
    // 1 In Progress task in sprint 1
    // 1 Done task completed on 2026-11-10
    const task1Id = crypto.randomUUID();
    const task2Id = crypto.randomUUID();
    const task3Id = crypto.randomUUID();

    const completedAt10th = new Date("2026-11-10T12:00:00+07:00");

    await db.batch([
      taskRepository.insertStmt(db, {
        id: task1Id,
        projectId,
        statusId: statusTodoId,
        title: "Overdue Todo Task",
        dueDate: "2026-11-15",
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2Id,
        projectId,
        sprintId,
        statusId: statusInProgressId,
        title: "Sprint InProgress Task",
        dueDate: "2026-11-25",
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task3Id,
        projectId,
        statusId: statusDoneId,
        title: "Done Task",
        dueDate: "2026-11-10",
        completedAt: completedAt10th,
        createdById: pmId,
        statusChangedAt: completedAt10th,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, task1Id, [leadId], now),
      ...taskAssigneeRepository.insertBatchStmt(db, task2Id, [leadId], now),
      ...taskAssigneeRepository.insertBatchStmt(db, task3Id, [leadId], now),
    ]);

    // Query report across full project
    const fullReport = await reportRepository.getMemberReport(db, {
      projectId,
      todayStr,
    });

    expect(fullReport.length).toBe(3);

    // PM row (0 tasks assigned)
    const pmRow = fullReport.find((r) => r.userId === pmId);
    expect(pmRow?.totalAssigned).toBe(0);
    expect(pmRow?.todoCount).toBe(0);
    expect(pmRow?.doneCount).toBe(0);

    // Zero-tasks member row
    const emptyRow = fullReport.find((r) => r.userId === memberWithNoTasksId);
    expect(emptyRow?.totalAssigned).toBe(0);

    // Lead row
    const leadRow = fullReport.find((r) => r.userId === leadId);
    expect(leadRow).toBeDefined();
    expect(leadRow?.totalAssigned).toBe(3);
    expect(leadRow?.todoCount).toBe(1);
    expect(leadRow?.inProgressCount).toBe(1);
    expect(leadRow?.doneCount).toBe(1);
    expect(leadRow?.overdueCount).toBe(1); // task1 is overdue
    expect(leadRow?.completedInRangeCount).toBe(1); // task3 completed

    // Query with sprint filter: only 1 task in sprint 1
    const sprintReport = await reportRepository.getMemberReport(db, {
      projectId,
      sprintId,
      todayStr,
    });
    const leadSprintRow = sprintReport.find((r) => r.userId === leadId);
    expect(leadSprintRow?.totalAssigned).toBe(1);
    expect(leadSprintRow?.inProgressCount).toBe(1);
    expect(leadSprintRow?.todoCount).toBe(0);

    // Query with date range: completed between Nov 01 and Nov 05 -> 0 completed
    const fromMsEarly = new Date("2026-11-01T00:00:00+07:00").getTime();
    const toMsEarly = new Date("2026-11-05T23:59:59+07:00").getTime();
    const earlyReport = await reportRepository.getMemberReport(db, {
      projectId,
      fromMs: fromMsEarly,
      toMs: toMsEarly,
      todayStr,
    });
    const leadEarlyRow = earlyReport.find((r) => r.userId === leadId);
    expect(leadEarlyRow?.completedInRangeCount).toBe(0);

    // Query with date range: completed between Nov 09 and Nov 11 -> 1 completed
    const fromMsRange = new Date("2026-11-09T00:00:00+07:00").getTime();
    const toMsRange = new Date("2026-11-11T23:59:59+07:00").getTime();
    const rangeReport = await reportRepository.getMemberReport(db, {
      projectId,
      fromMs: fromMsRange,
      toMs: toMsRange,
      todayStr,
    });
    const leadRangeRow = rangeReport.find((r) => r.userId === leadId);
    expect(leadRangeRow?.completedInRangeCount).toBe(1);
  });
});

describe("reportRepository.getProjectReportData (FR-31)", () => {
  it("FR-31 c1: EXPLAIN QUERY PLAN shows index use for status distribution and stale reviews", async () => {
    const db = createDatabase(env.DB);
    const planDist = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN
          SELECT s.id, s.name, s.category, s.position, CAST(COUNT(t.id) AS INTEGER) as taskCount
          FROM task_statuses s
          LEFT JOIN tasks t ON t.status_id = s.id AND t.project_id = 'p1' AND t.deleted_at IS NULL
          GROUP BY s.id, s.name, s.category, s.position
          ORDER BY s.position ASC`,
    );
    const detailsDist = planDist.map((r) => r.detail).join("\n");
    expect(detailsDist).toContain("idx_tasks_project_status");

    const planStale = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN
          SELECT t.id, t.number, t.title, s.id, s.name, t.status_changed_at
          FROM tasks t
          INNER JOIN task_statuses s ON s.id = t.status_id AND s.category = 'REVIEW'
          WHERE t.project_id = 'p1' AND t.deleted_at IS NULL AND t.status_changed_at <= 1700000000000`,
    );
    const detailsStale = planStale.map((r) => r.detail).join("\n");
    expect(detailsStale).toContain("idx_tasks_project_status");
  });

  it("FR-31 c1, c3: aggregates status distribution, overdue by status, and lists stale reviews (> 2 days)", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T10:00:00+07:00");
    const todayStr = "2026-11-19";
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const pmId = crypto.randomUUID();
    const devId = crypto.randomUUID();

    await Promise.all([
      userRepository.insert(db, {
        id: pmId,
        email: `pm-proj-${Date.now()}@example.com`,
        fullName: "PM Project",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
      userRepository.insert(db, {
        id: devId,
        email: `dev-proj-${Date.now()}@example.com`,
        fullName: "Dev Assignee",
        systemRole: "MEMBER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();
    const statusReviewId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Project Report Test",
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
        userId: devId,
        projectRole: "MEMBER",
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
        id: statusReviewId,
        name: "In Review",
        category: "REVIEW",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: "Done",
        category: "DONE",
        position: 3,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Tasks setup:
    // 1. Task in TODO, overdue (due Nov 10)
    const task1Id = crypto.randomUUID();
    // 2. Task in REVIEW for 3 days (stale review)
    const task2Id = crypto.randomUUID();
    // 3. Task in REVIEW for 1 day (not stale)
    const task3Id = crypto.randomUUID();
    // 4. Task in DONE
    const task4Id = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: task1Id,
        projectId,
        statusId: statusTodoId,
        title: "Overdue Todo Task",
        dueDate: "2026-11-10",
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2Id,
        projectId,
        statusId: statusReviewId,
        title: "Stale Review Task",
        dueDate: "2026-11-25",
        createdById: pmId,
        statusChangedAt: threeDaysAgo,
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
      }),
      taskRepository.insertStmt(db, {
        id: task3Id,
        projectId,
        statusId: statusReviewId,
        title: "Fresh Review Task",
        dueDate: "2026-11-25",
        createdById: pmId,
        statusChangedAt: oneDayAgo,
        createdAt: oneDayAgo,
        updatedAt: oneDayAgo,
      }),
      taskRepository.insertStmt(db, {
        id: task4Id,
        projectId,
        statusId: statusDoneId,
        title: "Done Task",
        dueDate: "2026-11-15",
        completedAt: now,
        createdById: pmId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, task2Id, [devId], now),
    ]);

    const reportData = await reportRepository.getProjectReportData(db, {
      projectId,
      todayStr,
      nowMs: now.getTime(),
      staleThresholdMs: twoDaysAgo.getTime(),
    });

    // 1. Status distribution
    const todoDist = reportData.statusDistribution.find((s) => s.statusId === statusTodoId);
    const reviewDist = reportData.statusDistribution.find((s) => s.statusId === statusReviewId);
    const doneDist = reportData.statusDistribution.find((s) => s.statusId === statusDoneId);

    expect(todoDist?.taskCount).toBe(1);
    expect(reviewDist?.taskCount).toBe(2);
    expect(doneDist?.taskCount).toBe(1);

    // 2. Overdue by status: only task1 in TODO is overdue
    expect(reportData.overdueByStatus).toHaveLength(1);
    expect(reportData.overdueByStatus[0]?.statusId).toBe(statusTodoId);
    expect(reportData.overdueByStatus[0]?.overdueCount).toBe(1);

    // 3. Stale reviews: only task2 is > 2 days in review
    expect(reportData.staleReviews).toHaveLength(1);
    expect(reportData.staleReviews[0]?.taskId).toBe(task2Id);
    expect(reportData.staleReviews[0]?.title).toBe("Stale Review Task");
    expect(reportData.staleReviews[0]?.daysInReview).toBeGreaterThanOrEqual(3);
    expect(reportData.staleReviews[0]?.assignees).toHaveLength(1);
    expect(reportData.staleReviews[0]?.assignees[0]?.fullName).toBe("Dev Assignee");
  });
});
