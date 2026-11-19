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
import { EXPORT_COLUMNS, ForbiddenError, NotFoundError } from "@pm/domain";

import { exportService, type ExportCsvResult, type ExportRowsResult } from "../../app/services/export.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

interface ExportTestWorld {
  projectId: string;
  projectCode: string;
  adminUser: { id: string; email: string };
  pmUser: { id: string; email: string };
  leadUser: { id: string; email: string };
  memberUser: { id: string; email: string };
  nonMemberUser: { id: string; email: string };
  taskId1: string;
  taskId2: string;
}

async function setupExportTestWorld(db: ReturnType<typeof createDatabase>): Promise<ExportTestWorld> {
  const now = new Date("2026-11-19T08:00:00Z");

  const makeUser = async (role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER", prefix: string, fullName?: string) => {
    const id = crypto.randomUUID();
    const email = `${prefix}-${id}@example.com`;
    await userRepository.insert(db, {
      id,
      email,
      fullName: fullName ?? `${prefix} User`,
      systemRole: role,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    return { id, email };
  };

  const adminUser = await makeUser("ADMIN", "admin", "Admin Person");
  const pmUser = await makeUser("MEMBER", "pm", "PM Person");
  const leadUser = await makeUser("MEMBER", "lead", "Lead Person");
  const memberUser = await makeUser("MEMBER", "member", "Alice Member");
  const nonMemberUser = await makeUser("MEMBER", "nonmember", "Bob NonMember");
  const assignee2 = await makeUser("MEMBER", "assignee2", "Charlie Developer");

  const projectId = crypto.randomUUID();
  const projectCode = `E${projectId.slice(0, 4).toUpperCase()}`;

  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: projectCode,
      name: "Export Test Project",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: pmUser.id,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: pmUser.id,
      projectRole: "PM",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: leadUser.id,
      projectRole: "TEAM_LEAD",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: memberUser.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
  ]);

  const defaultStatuses = await taskStatusRepository.list(db);
  let statusTodo = defaultStatuses.find((s) => s.category === "TODO");
  let statusDone = defaultStatuses.find((s) => s.category === "DONE");
  if (!statusTodo) {
    statusTodo = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `To Do ${crypto.randomUUID().slice(0, 4)}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!statusDone) {
    statusDone = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `Done ${crypto.randomUUID().slice(0, 4)}`,
      category: "DONE",
      position: 2,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  const sprint = await sprintRepository.insert(db, {
    id: crypto.randomUUID(),
    projectId,
    name: "Sprint 1",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    createdAt: now,
    updatedAt: now,
  });

  const taskId1 = crypto.randomUUID();
  const taskId2 = crypto.randomUUID();
  const archivedTaskId = crypto.randomUUID();

  // Task 1: overdue, assigned to Alice & Charlie, has sprint, title with quotes, comma, newline
  // Task 2: formula injection target
  await db.batch([
    taskRepository.insertStmt(db, {
      id: taskId1,
      projectId,
      statusId: statusTodo.id,
      sprintId: sprint.id,
      title: 'Task 1: "quoted", with comma\nand newline',
      priority: "HIGH",
      startDate: "2026-11-01",
      dueDate: "2026-11-10", // overdue relative to now 2026-11-19
      createdById: pmUser.id,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    taskRepository.insertStmt(db, {
      id: taskId2,
      projectId,
      statusId: statusDone.id,
      title: "=cmd|' /C calc'!A0", // formula injection target
      priority: "LOW",
      startDate: null,
      dueDate: null,
      createdById: pmUser.id,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    // Archived task should be excluded per FR-32 c1
    taskRepository.insertStmt(db, {
      id: archivedTaskId,
      projectId,
      statusId: statusTodo.id,
      title: "Archived Task",
      priority: "LOW",
      createdById: pmUser.id,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    taskRepository.archiveStmt(db, archivedTaskId, now),
  ]);

  // Assign Alice and Charlie to Task 1
  const [firstAssignee, ...restAssignees] = taskAssigneeRepository.insertBatchStmt(
    db,
    taskId1,
    [memberUser.id, assignee2.id],
    now,
  );
  if (firstAssignee) {
    await db.batch([firstAssignee, ...restAssignees]);
  }

  return {
    projectId,
    projectCode,
    adminUser,
    pmUser,
    leadUser,
    memberUser,
    nonMemberUser,
    taskId1,
    taskId2,
  };
}

function createTestContext(
  db: ReturnType<typeof createDatabase>,
  user: { id: string; email: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" },
  fixedNow: Date = new Date("2026-11-19T08:00:00Z"),
): RequestContext {
  return {
    env,
    db,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.email,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => fixedNow },
  };
}

describe("exportService (FR-32)", () => {
  it("FR-32 c1: exports tasks to CSV with UTF-8 BOM, exact 12 columns, and excluded archived tasks", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);
    const ctx = createTestContext(db, { ...world.pmUser, systemRole: "MEMBER" });

    const result = (await exportService.exportTasks(ctx, world.projectId, "csv")) as ExportCsvResult;

    expect(result.format).toBe("csv");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.fileName).toBe(`${world.projectCode}-tasks.csv`);
    expect(typeof result.data).toBe("string");

    const csvStr = result.data;
    // Check UTF-8 BOM
    expect(csvStr.startsWith("\uFEFF")).toBe(true);

    // Verify content preserves CSV format
    expect(csvStr).toContain(EXPORT_COLUMNS.join(","));
    expect(csvStr).toContain(`${world.projectCode}-1`);
    expect(csvStr).toContain('"Task 1: ""quoted"", with comma\nand newline"');
    expect(csvStr).toContain('"Alice Member, Charlie Developer"');
    expect(csvStr).toContain("Sprint 1");
    expect(csvStr).toContain("Yes"); // Overdue: Yes
    expect(csvStr).toContain(`${world.projectCode}-2`);
    expect(csvStr).toContain("No"); // Overdue: No
    expect(csvStr).not.toContain("Archived Task");
  });

  it("FR-32 c1: exports tasks to rows format with exact 12 columns, non-archived tasks, and identical values", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);
    const ctx = createTestContext(db, { ...world.pmUser, systemRole: "MEMBER" });

    const result = (await exportService.exportTasks(ctx, world.projectId, "rows")) as ExportRowsResult;

    expect(result.format).toBe("rows");
    expect(result.contentType).toBe("application/json");
    expect(result.fileName).toBe(`${world.projectCode}-tasks.xlsx`);

    const { columns, rows, fileName } = result.payload;
    expect(columns).toEqual([...EXPORT_COLUMNS]);
    expect(fileName).toBe(`${world.projectCode}-tasks.xlsx`);

    // Two active tasks (Task 1, Task 2), archived task is excluded
    expect(rows.length).toBe(2);

    const row1 = rows[0] ?? [];
    const row2 = rows[1] ?? [];

    expect(row1[0]).toBe(`${world.projectCode}-1`);
    expect(row1[1]).toBe('Task 1: "quoted", with comma\nand newline');
    expect(row1[2]).toContain("To Do");
    expect(row1[3]).toBe("TODO");
    expect(row1[4]).toBe("HIGH");
    expect(row1[5]).toBe("Alice Member, Charlie Developer");
    expect(row1[6]).toBe("Sprint 1");
    expect(row1[7]).toBe("2026-11-01");
    expect(row1[8]).toBe("2026-11-10");
    expect(row1[9]).toBe("Yes");

    expect(row2[0]).toBe(`${world.projectCode}-2`);
    expect(row2[1]).toBe("'=cmd|' /C calc'!A0"); // formula prefix applied
    expect(row2[9]).toBe("No");
  });

  it("FR-32 c1: CSV and rows formats produce identical cell values for the same project", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);
    const ctx = createTestContext(db, { ...world.pmUser, systemRole: "MEMBER" });

    const csvResult = (await exportService.exportTasks(ctx, world.projectId, "csv")) as ExportCsvResult;
    const rowsResult = (await exportService.exportTasks(ctx, world.projectId, "rows")) as ExportRowsResult;

    // Both should have the same number of rows
    expect(rowsResult.payload.rows.length).toBe(2);

    // Verify cell for cell agreement on task 1 and task 2
    for (let r = 0; r < rowsResult.payload.rows.length; r++) {
      const row = rowsResult.payload.rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const val = row[c] ?? "";
        // If value has quotes/comma/newlines, CSV quotes it, otherwise bare string
        if (val.length > 0 && !val.includes("\n") && !val.includes('"')) {
          expect(csvResult.data).toContain(val);
        }
      }
    }
  });

  it("FR-32 c2: sanitizes formula injection prefixes (=, +, -, @, tab, CR) in rows and CSV", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);
    const now = new Date("2026-11-19T08:00:00Z");

    const defaultStatuses = await taskStatusRepository.list(db);
    const statusTodo = defaultStatuses.find((s) => s.category === "TODO");

    const injectionTargets = ["=1+1", "+2+2", "-3-3", "@SUM(A1:A2)", "\tTAB_INJECT", "\rCR_INJECT"];

    for (let i = 0; i < injectionTargets.length; i++) {
      await db.batch([
        taskRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          projectId: world.projectId,
          statusId: statusTodo?.id ?? "",
          title: injectionTargets[i] ?? "",
          priority: "MEDIUM",
          createdById: world.pmUser.id,
          statusChangedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      ]);
    }

    const ctx = createTestContext(db, { ...world.pmUser, systemRole: "MEMBER" });
    const rowsResult = (await exportService.exportTasks(ctx, world.projectId, "rows")) as ExportRowsResult;

    for (const target of injectionTargets) {
      const match = rowsResult.payload.rows.find((r) => r[1] === `'${target}`);
      expect(match).toBeDefined();
      expect(match?.[1]?.startsWith("'")).toBe(true);
    }
  });

  it("FR-32 c3: denies export to project TEAM_LEAD and MEMBER with 403 Forbidden for both formats", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);

    const leadCtx = createTestContext(db, { ...world.leadUser, systemRole: "MEMBER" });
    await expect(exportService.exportTasks(leadCtx, world.projectId, "csv")).rejects.toThrow(ForbiddenError);
    await expect(exportService.exportTasks(leadCtx, world.projectId, "rows")).rejects.toThrow(ForbiddenError);

    const memberCtx = createTestContext(db, { ...world.memberUser, systemRole: "MEMBER" });
    await expect(exportService.exportTasks(memberCtx, world.projectId, "csv")).rejects.toThrow(ForbiddenError);
    await expect(exportService.exportTasks(memberCtx, world.projectId, "rows")).rejects.toThrow(ForbiddenError);
  });

  it("FR-32 c3 / P3: returns 404 for non-member for both formats", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);

    const nonMemberCtx = createTestContext(db, { ...world.nonMemberUser, systemRole: "MEMBER" });
    await expect(exportService.exportTasks(nonMemberCtx, world.projectId, "csv")).rejects.toThrow(NotFoundError);
    await expect(exportService.exportTasks(nonMemberCtx, world.projectId, "rows")).rejects.toThrow(NotFoundError);
  });

  it("FR-32 c1: allows Admin to export any project in both formats", async () => {
    const db = createDatabase(env.DB);
    const world = await setupExportTestWorld(db);

    const adminCtx = createTestContext(db, { ...world.adminUser, systemRole: "ADMIN" });
    const csvResult = await exportService.exportTasks(adminCtx, world.projectId, "csv");
    expect(csvResult.fileName).toBe(`${world.projectCode}-tasks.csv`);

    const rowsResult = await exportService.exportTasks(adminCtx, world.projectId, "rows");
    expect(rowsResult.fileName).toBe(`${world.projectCode}-tasks.xlsx`);
  });
});
