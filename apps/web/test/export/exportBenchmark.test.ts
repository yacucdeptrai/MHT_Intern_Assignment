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
import { EXPORT_COLUMNS } from "@pm/domain";

import { exportService, type ExportCsvResult, type ExportRowsResult } from "../../app/services/export.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

describe("Export Functional Scale Test (500 Tasks)", () => {
  it("exports 500 tasks successfully in both CSV and rows formats with correct row count", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T08:00:00Z");

    const pmUserId = crypto.randomUUID();
    await userRepository.insert(db, {
      id: pmUserId,
      email: `pm-bench-${pmUserId}@example.com`,
      fullName: "Benchmark PM",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const assigneeId = crypto.randomUUID();
    await userRepository.insert(db, {
      id: assigneeId,
      email: `dev-bench-${assigneeId}@example.com`,
      fullName: "Benchmark Dev",
      systemRole: "MEMBER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const projectCode = `B${projectId.slice(0, 4).toUpperCase()}`;

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: projectCode,
        name: "Benchmark Project",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pmUserId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pmUserId,
        projectRole: "PM",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: assigneeId,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const defaultStatuses = await taskStatusRepository.list(db);
    const statusTodo =
      defaultStatuses.find((s) => s.category === "TODO") ??
      (await taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: `To Do ${crypto.randomUUID().slice(0, 4)}`,
        category: "TODO",
        position: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }));

    const sprint = await sprintRepository.insert(db, {
      id: crypto.randomUUID(),
      projectId,
      name: "Benchmark Sprint",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      createdAt: now,
      updatedAt: now,
    });

    // Populate 500 tasks in batches of 50
    const taskCount = 500;
    const taskIds: string[] = [];
    for (let chunkStart = 0; chunkStart < taskCount; chunkStart += 50) {
      const chunkEnd = Math.min(chunkStart + 50, taskCount);
      const batchInserts = [];
      for (let i = chunkStart; i < chunkEnd; i++) {
        const taskId = crypto.randomUUID();
        taskIds.push(taskId);
        batchInserts.push(
          taskRepository.insertStmt(db, {
            id: taskId,
            projectId,
            statusId: statusTodo.id,
            sprintId: sprint.id,
            title: `Benchmark Task #${i + 1} with standard title and characters`,
            priority: i % 4 === 0 ? "URGENT" : i % 3 === 0 ? "HIGH" : i % 2 === 0 ? "MEDIUM" : "LOW",
            startDate: "2026-11-01",
            dueDate: i % 2 === 0 ? "2026-11-15" : "2026-11-25",
            createdById: pmUserId,
            statusChangedAt: now,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      const [firstInsert, ...restInserts] = batchInserts;
      if (firstInsert) {
        await db.batch([firstInsert, ...restInserts]);
      }
    }

    // Assign dev to every other task
    for (let chunkStart = 0; chunkStart < taskCount; chunkStart += 50) {
      const chunkEnd = Math.min(chunkStart + 50, taskCount);
      const assigneeBatch = [];
      for (let i = chunkStart; i < chunkEnd; i += 2) {
        const taskId = taskIds[i];
        if (!taskId) continue;
        assigneeBatch.push(...taskAssigneeRepository.insertBatchStmt(db, taskId, [assigneeId], now));
      }
      const [firstAssignee, ...restAssignees] = assigneeBatch;
      if (firstAssignee) {
        await db.batch([firstAssignee, ...restAssignees]);
      }
    }

    const ctx: RequestContext = {
      env,
      db,
      user: {
        id: pmUserId,
        email: "pm@example.com",
        fullName: "Benchmark PM",
        systemRole: "MEMBER",
        status: "ACTIVE",
      },
      requestId: "bench-req",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      waitUntil: () => {},
      clock: { now: () => now },
    };

    const csvResult = (await exportService.exportTasks(ctx, projectId, "csv")) as ExportCsvResult;
    expect(csvResult.format).toBe("csv");
    expect(typeof csvResult.data).toBe("string");
    expect(csvResult.data.startsWith("\uFEFF")).toBe(true);

    const rowsResult = (await exportService.exportTasks(ctx, projectId, "rows")) as ExportRowsResult;
    expect(rowsResult.format).toBe("rows");
    expect(rowsResult.payload.columns).toEqual([...EXPORT_COLUMNS]);
    expect(rowsResult.payload.rows.length).toBe(500);
  });
});
