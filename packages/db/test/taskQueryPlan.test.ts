import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectRepository,
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

describe("Task list queries and EXPLAIN QUERY PLAN (M3-T3 / FR-16)", () => {
  it("EXPLAIN QUERY PLAN shows index use for idx_tasks_project_status", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE project_id = 'p1' AND deleted_at IS NULL AND status_id = 's1'`,
    );

    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("USING INDEX idx_tasks_project_status");
  });

  it("EXPLAIN QUERY PLAN shows index use for idx_task_assignees_user", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(sql`EXPLAIN QUERY PLAN SELECT * FROM task_assignees WHERE user_id = 'u1'`);

    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("USING INDEX idx_task_assignees_user");
  });

  it("EXPLAIN QUERY PLAN shows index use for idx_tasks_due", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE due_date = '2026-11-20' AND deleted_at IS NULL`,
    );

    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("USING INDEX idx_tasks_due");
  });

  it("FR-16 c2: listProjectTasks returns paginated tasks and filters correctly", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const projectId = crypto.randomUUID();
    const statusId1 = crypto.randomUUID();
    const statusId2 = crypto.randomUUID();

    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `test-${Date.now()}@example.com`,
      fullName: "Test User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PRJ${Date.now().toString().slice(-6)}`,
        name: "Project 1",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId1,
        name: `Status 1 ${statusId1.slice(0, 4)}`,
        category: "TODO",
        isDefault: false,
        position: 10,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId2,
        name: `Status 2 ${statusId2.slice(0, 4)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 20,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Create 3 tasks: 2 in status1, 1 in status2
    const task1Id = crypto.randomUUID();
    const task2Id = crypto.randomUUID();
    const task3Id = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: task1Id,
        projectId,
        statusId: statusId1,
        title: "Task 1",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task2Id,
        projectId,
        statusId: statusId1,
        title: "Task 2",
        priority: "LOW",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: task3Id,
        projectId,
        statusId: statusId2,
        title: "Task 3",
        priority: "HIGH",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, task1Id, [user.id], now),
    ]);

    // List all
    const allResult = await taskRepository.listProjectTasks(db, { projectId, page: 1, pageSize: 50 });
    expect(allResult.total).toBe(3);
    expect(allResult.items).toHaveLength(3);
    expect(allResult.items[0]?.number).toBe(1);

    // Filter by statusId1
    const filteredStatus = await taskRepository.listProjectTasks(db, { projectId, statusId: statusId1 });
    expect(filteredStatus.total).toBe(2);
    expect(filteredStatus.items.every((t) => t.statusId === statusId1)).toBe(true);

    // Filter by priority HIGH
    const filteredPriority = await taskRepository.listProjectTasks(db, { projectId, priority: "HIGH" });
    expect(filteredPriority.total).toBe(2);

    // Filter by assigneeId
    const filteredAssignee = await taskRepository.listProjectTasks(db, { projectId, assigneeId: user.id });
    expect(filteredAssignee.total).toBe(1);
    expect(filteredAssignee.items[0]?.id).toBe(task1Id);

    // Pagination: page 1 with pageSize 2 -> 2 items, totalPages 2
    const page1 = await taskRepository.listProjectTasks(db, { projectId, page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalPages).toBe(2);

    // Pagination: page 2 with pageSize 2 -> 1 item
    const page2 = await taskRepository.listProjectTasks(db, { projectId, page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.id).toBe(task3Id);
  });

  it("FR-16 c1: listMyTasks returns assigned tasks across accessible projects with filters", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const projectId1 = crypto.randomUUID();
    const projectId2 = crypto.randomUUID();
    const statusId = crypto.randomUUID();

    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `my-user-${Date.now()}@example.com`,
      fullName: "My User",
      systemRole: "MEMBER",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId1,
        code: `P1${Date.now().toString().slice(-6)}`,
        name: "Project Alpha",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectRepository.insertStmt(db, {
        id: projectId2,
        code: `P2${Date.now().toString().slice(-6)}`,
        name: "Project Beta",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId,
        name: `Status ${statusId.slice(0, 4)}`,
        category: "IN_PROGRESS",
        isDefault: false,
        position: 10,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();

    await db.batch([
      taskRepository.insertStmt(db, {
        id: t1,
        projectId: projectId1,
        statusId,
        title: "Alpha Task",
        priority: "URGENT",
        dueDate: "2026-11-10",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: t2,
        projectId: projectId2,
        statusId,
        title: "Beta Task",
        priority: "LOW",
        dueDate: "2026-11-20",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, t1, [user.id], now),
      ...taskAssigneeRepository.insertBatchStmt(db, t2, [user.id], now),
    ]);

    // My tasks for user across both projects
    const myTasks = await taskRepository.listMyTasks(db, {
      userId: user.id,
      allowedProjectIds: [projectId1, projectId2],
    });
    expect(myTasks.total).toBe(2);
    expect(myTasks.items).toHaveLength(2);
    expect(myTasks.items.some((i) => i.projectCode.startsWith("P1"))).toBe(true);

    // Filter by project 1
    const p1Tasks = await taskRepository.listMyTasks(db, {
      userId: user.id,
      allowedProjectIds: [projectId1, projectId2],
      projectId: projectId1,
    });
    expect(p1Tasks.total).toBe(1);
    expect(p1Tasks.items[0]?.title).toBe("Alpha Task");

    // Filter overdue
    const overdueTasks = await taskRepository.listMyTasks(db, {
      userId: user.id,
      allowedProjectIds: [projectId1, projectId2],
      dueRange: "overdue",
      todayStr: "2026-11-15",
    });
    expect(overdueTasks.total).toBe(1);
    expect(overdueTasks.items[0]?.id).toBe(t1);
  });

  describe("Calendar queries (FR-35)", () => {
    it("EXPLAIN QUERY PLAN shows index use for idx_tasks_due on calendar range lookups", async () => {
      const db = createDatabase(env.DB);
      const plan = await db.all<QueryPlanRow>(
        sql`EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE deleted_at IS NULL AND due_date >= '2026-11-01' AND due_date <= '2026-11-30'`,
      );

      const details = plan.map((r) => r.detail).join("\n");
      expect(details).toContain("USING INDEX idx_tasks_due");
    });

    it("FR-35 c1: listCalendarTasks returns spans and single-day tasks, omitting tasks without dates", async () => {
      const db = createDatabase(env.DB);
      const now = new Date();
      const projectId = crypto.randomUUID();
      const statusId = crypto.randomUUID();

      const user = await userRepository.insert(db, {
        id: crypto.randomUUID(),
        email: `cal-user-${Date.now()}@example.com`,
        fullName: "Calendar User",
        systemRole: "MEMBER",
        status: "ACTIVE",
        passwordHash: "hash",
        passwordIterations: 100000,
        createdAt: now,
        updatedAt: now,
      });

      await db.batch([
        projectRepository.insertStmt(db, {
          id: projectId,
          code: `CAL${Date.now().toString().slice(-6)}`,
          name: "Calendar Test Project",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          status: "ACTIVE",
          createdById: user.id,
          createdAt: now,
          updatedAt: now,
        }),
        taskStatusRepository.insertStmt(db, {
          id: statusId,
          name: `Status-${crypto.randomUUID().slice(0, 6)}`,
          category: "TODO",
          isDefault: true,
          position: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ]);

      const tSpan = crypto.randomUUID(); // Nov 10 to Nov 20 (overlaps Nov 15-25)
      const tSingle = crypto.randomUUID(); // Nov 18 only (overlaps Nov 15-25)
      const tNoDates = crypto.randomUUID(); // No dates (omitted)
      const tOutside = crypto.randomUUID(); // Dec 01 only (outside Nov 15-25)

      await db.batch([
        taskRepository.insertStmt(db, {
          id: tSpan,
          projectId,
          statusId,
          title: "Span Task",
          startDate: "2026-11-10",
          dueDate: "2026-11-20",
          createdById: user.id,
          statusChangedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        taskRepository.insertStmt(db, {
          id: tSingle,
          projectId,
          statusId,
          title: "Single Day Task",
          dueDate: "2026-11-18",
          createdById: user.id,
          statusChangedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        taskRepository.insertStmt(db, {
          id: tNoDates,
          projectId,
          statusId,
          title: "No Date Task",
          createdById: user.id,
          statusChangedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        taskRepository.insertStmt(db, {
          id: tOutside,
          projectId,
          statusId,
          title: "Outside Task",
          dueDate: "2026-12-01",
          createdById: user.id,
          statusChangedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      ]);

      const events = await taskRepository.listCalendarTasks(db, {
        from: "2026-11-15",
        to: "2026-11-25",
        projectId,
      });

      expect(events.map((e) => e.id)).toContain(tSpan);
      expect(events.map((e) => e.id)).toContain(tSingle);
      expect(events.map((e) => e.id)).not.toContain(tNoDates);
      expect(events.map((e) => e.id)).not.toContain(tOutside);
    });
  });
});
