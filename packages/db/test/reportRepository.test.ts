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
