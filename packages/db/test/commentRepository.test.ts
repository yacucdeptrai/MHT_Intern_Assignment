import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  commentRepository,
  conflictGuardStmt,
  createDatabase,
  isVersionConflict,
  projectRepository,
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

describe("commentRepository & comments schema (docs/03 §comments, M4-T3)", () => {
  async function setupTask() {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `commenter-${crypto.randomUUID()}@example.com`,
      fullName: "Comment Tester",
      systemRole: "TEAM_LEAD",
      status: "ACTIVE",
      passwordHash: "hash",
      passwordIterations: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const projectId = crypto.randomUUID();
    const statusId = crypto.randomUUID();
    const taskId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `CM${projectId.slice(0, 6).toUpperCase()}`,
        name: "Comment Test Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusId,
        name: `Todo ${statusId.slice(0, 6)}`,
        category: "TODO",
        position: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId,
        statusId,
        title: "Task With Comments",
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    return { db, user, taskId, now };
  }

  it("FR-23 c1 / A19: inserts root comment via insertStmt, supports reply self-FK, and filters deleted_at", async () => {
    const { db, user, taskId, now } = await setupTask();
    const rootId = crypto.randomUUID();
    const replyId = crypto.randomUUID();

    await db.batch([
      commentRepository.insertStmt(db, {
        id: rootId,
        taskId,
        authorId: user.id,
        parentCommentId: null,
        body: "Needs error handling for network timeouts",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      commentRepository.insertStmt(db, {
        id: replyId,
        taskId,
        authorId: user.id,
        parentCommentId: rootId,
        body: "Will fix in next commit",
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: new Date(now.getTime() + 1000),
        deletedAt: null,
      }),
    ]);

    const foundRoot = await commentRepository.findById(db, rootId);
    expect(foundRoot?.body).toBe("Needs error handling for network timeouts");
    expect(foundRoot?.parentCommentId).toBeNull();

    const list = await commentRepository.listByTaskId(db, taskId);
    expect(list.map((c) => c.id)).toEqual([rootId, replyId]);
  });

  it("enforces CHECK constraints (body 1..5000 chars) and foreign keys on comments", async () => {
    const { db, user, taskId, now } = await setupTask();

    // Empty body violates CHECK
    await expect(
      db.batch([
        commentRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          taskId,
          authorId: user.id,
          parentCommentId: null,
          body: "",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      ]),
    ).rejects.toThrow();

    // Body > 5000 chars violates CHECK
    await expect(
      db.batch([
        commentRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          taskId,
          authorId: user.id,
          parentCommentId: null,
          body: "x".repeat(5001),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      ]),
    ).rejects.toThrow();

    // Non-existent parent_comment_id violates self-FK
    await expect(
      db.batch([
        commentRepository.insertStmt(db, {
          id: crypto.randomUUID(),
          taskId,
          authorId: user.id,
          parentCommentId: crypto.randomUUID(),
          body: "Orphan reply",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      ]),
    ).rejects.toThrow();
  });

  it("EXPLAIN QUERY PLAN uses idx_comments_task for task discussion query", async () => {
    const db = createDatabase(env.DB);
    const plan = await db.all<QueryPlanRow>(
      sql`EXPLAIN QUERY PLAN SELECT * FROM comments WHERE task_id = 't1' ORDER BY created_at ASC`,
    );
    const details = plan.map((r) => r.detail).join("\n");
    expect(details).toContain("USING INDEX idx_comments_task");
  });

  it("FR-19 c1..c3 & FR-03 c4: listByTaskWithAuthor includes soft-deleted comments and maps soft-deleted author to 'Deleted user'", async () => {
    const { db, user, taskId, now } = await setupTask();
    const deletedAuthor = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `deleted-author-${crypto.randomUUID()}@example.com`,
      fullName: "Former Commenter",
      systemRole: "MEMBER",
      status: "LOCKED",
      createdAt: now,
      updatedAt: now,
    });

    const rootId = crypto.randomUUID();
    const replyId = crypto.randomUUID();

    await db.batch([
      commentRepository.insertStmt(db, {
        id: rootId,
        taskId,
        authorId: deletedAuthor.id,
        parentCommentId: null,
        body: "Original root body before deletion",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      commentRepository.insertStmt(db, {
        id: replyId,
        taskId,
        authorId: user.id,
        parentCommentId: rootId,
        body: "Visible reply on deleted root",
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: new Date(now.getTime() + 1000),
        deletedAt: null,
      }),
      userRepository.softDeleteStmt(db, deletedAuthor.id, new Date(now.getTime() + 2000)),
      conflictGuardStmt(db),
    ]);

    // A22: first soft delete succeeds
    const deleteTime = new Date(now.getTime() + 3000);
    await db.batch([commentRepository.softDeleteStmt(db, rootId, deleteTime), conflictGuardStmt(db)]);

    // Second soft delete of the same comment fails via conflictGuardStmt
    let conflictErr: unknown;
    try {
      await db.batch([commentRepository.softDeleteStmt(db, rootId, deleteTime), conflictGuardStmt(db)]);
    } catch (err) {
      conflictErr = err;
    }
    expect(isVersionConflict(conflictErr)).toBe(true);

    const foundIncludingDeleted = await commentRepository.findByIdIncludingDeleted(db, rootId);
    expect(foundIncludingDeleted?.deletedAt?.getTime()).toBe(deleteTime.getTime());

    const rows = await commentRepository.listByTaskWithAuthor(db, taskId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe(rootId);
    expect(rows[0]?.authorName).toBe("Deleted user");
    expect(rows[0]?.deletedAt?.getTime()).toBe(deleteTime.getTime());
    expect(rows[1]?.id).toBe(replyId);
    expect(rows[1]?.authorName).toBe("Comment Tester");
    expect(rows[1]?.deletedAt).toBeNull();
  });
});
