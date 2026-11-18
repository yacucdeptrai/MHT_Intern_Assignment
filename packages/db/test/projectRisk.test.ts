import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { isOverdue } from "@pm/domain";

import { createDatabase, projectRepository, taskRepository, taskStatusRepository, userRepository } from "../src";

interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

describe("Projects at risk repository queries (M8-T1 / FR-33 c3)", () => {
  it("FR-33 c3: EXPLAIN QUERY PLAN shows index use for projects at risk query", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN
          SELECT p.id, p.code, p.name, count(t.id) as overdueCount
          FROM projects p
          INNER JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
          INNER JOIN task_statuses s ON s.id = t.status_id AND s.category != 'DONE'
          WHERE p.deleted_at IS NULL AND t.due_date IS NOT NULL AND t.due_date < '2026-11-20'
          GROUP BY p.id, p.code, p.name
          HAVING count(t.id) > 0
          ORDER BY overdueCount DESC, p.code ASC`,
    );

    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("idx_tasks_due");
  });

  it("FR-33 c3: listProjectsAtRisk groups by project, includes subtasks, and excludes archived projects/tasks and DONE tasks", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const todayStr = "2026-11-20";

    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `risk-user-${Date.now()}@example.com`,
      fullName: "Risk Test User",
      systemRole: "PM",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const statusTodoId = crypto.randomUUID();
    const statusInProgressId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `Todo ${statusTodoId.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusInProgressId,
        name: `In Progress ${statusInProgressId.slice(0, 4)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 2,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `Done ${statusDoneId.slice(0, 4)}`,
        category: "DONE",
        isDefault: false,
        position: 3,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectAId = crypto.randomUUID();
    const projectBId = crypto.randomUUID();
    const projectCId = crypto.randomUUID();
    const projectArchivedId = crypto.randomUUID();

    const codeSuffix = Date.now().toString().slice(-4);
    const codeA = `RA${codeSuffix}`;
    const codeB = `RB${codeSuffix}`;
    const codeC = `RC${codeSuffix}`;
    const codeArchived = `RX${codeSuffix}`;

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectAId,
        code: codeA,
        name: "Project A",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: projectBId,
        code: codeB,
        name: "Project B",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: projectCId,
        code: codeC,
        name: "Project C",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: projectArchivedId,
        code: codeArchived,
        name: "Project Archived",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
    ]);

    const task1ProjectA = crypto.randomUUID();
    const task2ProjectA = crypto.randomUUID();
    const taskArchivedProjectA = crypto.randomUUID();
    const taskDoneProjectA = crypto.randomUUID();
    const taskFutureProjectA = crypto.randomUUID();

    const taskParentProjectB = crypto.randomUUID();
    const subtaskProjectB = crypto.randomUUID();
    const taskArchivedProject = crypto.randomUUID();

    await db.batch([
      // Project A: 2 active overdue tasks (due 2026-11-18 < 2026-11-20)
      taskRepository.insertStmt(db, {
        id: task1ProjectA,
        projectId: projectAId,
        statusId: statusTodoId,
        title: "Overdue task 1 A",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2ProjectA,
        projectId: projectAId,
        statusId: statusInProgressId,
        title: "Overdue task 2 A",
        dueDate: "2026-11-19",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Project A: archived task (should be excluded)
      taskRepository.insertStmt(db, {
        id: taskArchivedProjectA,
        projectId: projectAId,
        statusId: statusTodoId,
        title: "Archived overdue task A",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Project A: DONE task (should be excluded)
      taskRepository.insertStmt(db, {
        id: taskDoneProjectA,
        projectId: projectAId,
        statusId: statusDoneId,
        title: "Done overdue task A",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      // Project A: Future task (not overdue, should be excluded)
      taskRepository.insertStmt(db, {
        id: taskFutureProjectA,
        projectId: projectAId,
        statusId: statusTodoId,
        title: "Future task A",
        dueDate: "2026-11-21",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),

      // Project B: 1 top-level overdue + 1 subtask overdue = 2 overdue
      taskRepository.insertStmt(db, {
        id: taskParentProjectB,
        projectId: projectBId,
        statusId: statusInProgressId,
        title: "Parent overdue B",
        dueDate: "2026-11-15",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: subtaskProjectB,
        projectId: projectBId,
        parentTaskId: taskParentProjectB,
        statusId: statusTodoId,
        title: "Subtask overdue B",
        dueDate: "2026-11-16",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),

      // Task in archived project (should be excluded)
      taskRepository.insertStmt(db, {
        id: taskArchivedProject,
        projectId: projectArchivedId,
        statusId: statusTodoId,
        title: "Overdue in archived project",
        dueDate: "2026-11-18",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Soft delete the archived task in Project A
    await db.batch([taskRepository.archiveStmt(db, taskArchivedProjectA, now)]);

    // Call listProjectsAtRisk
    const allAtRisk = await projectRepository.listProjectsAtRisk(db, { todayStr });
    const targetA = allAtRisk.find((p) => p.id === projectAId);
    const targetB = allAtRisk.find((p) => p.id === projectBId);
    const targetC = allAtRisk.find((p) => p.id === projectCId);
    const targetArchived = allAtRisk.find((p) => p.id === projectArchivedId);

    expect(targetA).toBeDefined();
    expect(targetA?.overdueCount).toBe(2);

    expect(targetB).toBeDefined();
    expect(targetB?.overdueCount).toBe(2);

    expect(targetC).toBeUndefined(); // Project C has 0 overdue tasks
    expect(targetArchived).toBeUndefined(); // Archived project not included

    // Test sorting: overdueCount DESC, then code ASC
    const relevant = allAtRisk.filter((p) => p.id === projectAId || p.id === projectBId);
    expect(relevant.length).toBe(2);
    // Both have overdueCount = 2, so sorted by code ASC
    if (codeA < codeB) {
      expect(relevant[0]?.id).toBe(projectAId);
      expect(relevant[1]?.id).toBe(projectBId);
    } else {
      expect(relevant[0]?.id).toBe(projectBId);
      expect(relevant[1]?.id).toBe(projectAId);
    }

    // Test allowedProjectIds (PM scope)
    const pmAtRisk = await projectRepository.listProjectsAtRisk(db, {
      todayStr,
      allowedProjectIds: [projectAId],
    });
    expect(pmAtRisk.some((p) => p.id === projectAId)).toBe(true);
    expect(pmAtRisk.some((p) => p.id === projectBId)).toBe(false);

    // Empty allowedProjectIds returns []
    const emptyScope = await projectRepository.listProjectsAtRisk(db, {
      todayStr,
      allowedProjectIds: [],
    });
    expect(emptyScope).toEqual([]);
  });

  it("FR-33 c3: SQL overdue filter and isOverdue domain helper agree on all fixtures (including timezone edges)", async () => {
    const db = createDatabase(env.DB);

    // Asia/Ho_Chi_Minh is UTC+7.
    // 2026-11-19T23:30:00+07:00 is 2026-11-19T16:30:00.000Z.
    // 2026-11-20T00:30:00+07:00 is 2026-11-19T17:30:00.000Z.
    const timeAt2330 = new Date("2026-11-19T16:30:00.000Z");
    const timeAt0030 = new Date("2026-11-19T17:30:00.000Z");

    const edgeUser = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `edge-user-${Date.now()}@example.com`,
      fullName: "Edge User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: timeAt2330,
      updatedAt: timeAt2330,
    });

    const statusTodoId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    await db.batch([
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `TodoEdge ${statusTodoId.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 100,
        createdAt: timeAt2330,
        updatedAt: timeAt2330,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `DoneEdge ${statusDoneId.slice(0, 4)}`,
        category: "DONE",
        isDefault: false,
        position: 101,
        createdAt: timeAt2330,
        updatedAt: timeAt2330,
      }),
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `EDGE${Date.now().toString().slice(-4)}`,
        name: "Edge Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: edgeUser.id,
        createdAt: timeAt2330,
        updatedAt: timeAt2330,
      }),
    ]);

    const testFixtures = [
      {
        id: crypto.randomUUID(),
        title: "Due yesterday",
        dueDate: "2026-11-18",
        statusId: statusTodoId,
        statusCategory: "TODO",
      },
      {
        id: crypto.randomUUID(),
        title: "Due on the 19th",
        dueDate: "2026-11-19",
        statusId: statusTodoId,
        statusCategory: "TODO",
      },
      {
        id: crypto.randomUUID(),
        title: "Due on the 20th",
        dueDate: "2026-11-20",
        statusId: statusTodoId,
        statusCategory: "TODO",
      },
      {
        id: crypto.randomUUID(),
        title: "Done task on the 18th",
        dueDate: "2026-11-18",
        statusId: statusDoneId,
        statusCategory: "DONE",
      },
      {
        id: crypto.randomUUID(),
        title: "No due date task",
        dueDate: null,
        statusId: statusTodoId,
        statusCategory: "TODO",
      },
    ];

    for (const f of testFixtures) {
      await db.batch([
        taskRepository.insertStmt(db, {
          id: f.id,
          projectId,
          statusId: f.statusId,
          title: f.title,
          dueDate: f.dueDate,
          createdById: edgeUser.id,
          statusChangedAt: timeAt2330,
          createdAt: timeAt2330,
          updatedAt: timeAt2330,
        }),
      ]);
    }

    // Check at 23:30 (today in HCM is 2026-11-19)
    const todayStr2330 = "2026-11-19";
    for (const f of testFixtures) {
      const helperResult = isOverdue(
        { dueDate: f.dueDate, statusCategory: f.statusCategory, deletedAt: null },
        timeAt2330,
      );

      // SQL condition test
      const sqlRows = await db.all<{ isOverdueSql: number }>(
        sql`SELECT CASE WHEN due_date IS NOT NULL AND due_date < ${todayStr2330} AND status_id != ${statusDoneId} THEN 1 ELSE 0 END as isOverdueSql
            FROM tasks WHERE id = ${f.id}`,
      );
      const sqlResult = Boolean(sqlRows[0]?.isOverdueSql);

      expect(sqlResult).toBe(helperResult);
    }

    // Check at 00:30 (today in HCM is 2026-11-20)
    const todayStr0030 = "2026-11-20";
    for (const f of testFixtures) {
      const helperResult = isOverdue(
        { dueDate: f.dueDate, statusCategory: f.statusCategory, deletedAt: null },
        timeAt0030,
      );

      const sqlRows = await db.all<{ isOverdueSql: number }>(
        sql`SELECT CASE WHEN due_date IS NOT NULL AND due_date < ${todayStr0030} AND status_id != ${statusDoneId} THEN 1 ELSE 0 END as isOverdueSql
            FROM tasks WHERE id = ${f.id}`,
      );
      const sqlResult = Boolean(sqlRows[0]?.isOverdueSql);

      expect(sqlResult).toBe(helperResult);
    }
  });
});
