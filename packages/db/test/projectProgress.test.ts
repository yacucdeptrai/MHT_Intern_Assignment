import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "../src";
import { chunk } from "../src/chunk";

describe("chunk", () => {
  it("splits lists so IN (...) stays under the D1 bound-parameter limit", () => {
    const ids = Array.from({ length: 205 }, (_, index) => String(index));
    const parts = chunk(ids);
    expect(parts.map((part) => part.length)).toEqual([90, 90, 25]);
    expect(parts.flat()).toEqual(ids);
    expect(chunk([])).toEqual([]);
  });
});

describe("projectRepository.countTaskProgress / projectMemberRepository.listPmNamesByProjects", () => {
  it("counts live and DONE tasks per project and accepts more than 100 project ids", async () => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `progress-${crypto.randomUUID()}@example.com`,
      fullName: "Progress Tester",
      systemRole: "PM",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    const projectId = crypto.randomUUID();
    const todoId = crypto.randomUUID();
    const doneId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `PG${projectId.slice(0, 6).toUpperCase()}`,
        name: "Progress Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, { projectId, userId: user.id, projectRole: "PM", createdAt: now }),
      taskStatusRepository.insertStmt(db, {
        id: todoId,
        name: `Todo ${todoId.slice(0, 6)}`,
        category: "TODO",
        position: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: doneId,
        name: `Done ${doneId.slice(0, 6)}`,
        category: "DONE",
        position: 2,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    const archivedId = crypto.randomUUID();
    const task = (statusId: string, id: string = crypto.randomUUID()) =>
      taskRepository.insertStmt(db, {
        id,
        projectId,
        statusId,
        title: "Progress task",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    await db.batch([task(todoId), task(doneId), task(doneId), task(doneId, archivedId)]);
    // Archived (soft-deleted) tasks do not count.
    await db.batch([taskRepository.archiveStmt(db, archivedId, now)]);

    const padding = Array.from({ length: 150 }, () => crypto.randomUUID());
    const progress = await projectRepository.countTaskProgress(db, [...padding, projectId]);
    expect(progress).toEqual([{ projectId, total: 3, done: 2 }]);

    const pms = await projectMemberRepository.listPmNamesByProjects(db, [...padding, projectId]);
    expect(pms).toEqual([{ projectId, fullName: "Progress Tester" }]);
  });
});
