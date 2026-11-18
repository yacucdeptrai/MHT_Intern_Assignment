import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  attachmentRepository,
  createDatabase,
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

describe("attachmentRepository & attachments schema (docs/03 §attachments, FR-18)", () => {
  async function setupTask() {
    const db = createDatabase(env.DB);
    const now = new Date();
    const user = await userRepository.insert(db, {
      id: crypto.randomUUID(),
      email: `att-uploader-${crypto.randomUUID()}@example.com`,
      fullName: "Attachment Tester",
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
        code: `AT${projectId.slice(0, 6).toUpperCase()}`,
        name: "Attachment Test Project",
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
        title: "Attachment Task",
        statusId,
        createdById: user.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    return { db, user, projectId, taskId, now };
  }

  it("inserts, finds, lists with uploader name, and deletes attachments", () =>
    new Promise<void>((resolve, reject) => {
      setupTask()
        .then(async ({ db, user, taskId, now }) => {
          const attachmentId = crypto.randomUUID();
          const storageKey = `projects/p1/tasks/${taskId}/${attachmentId}`;

          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: attachmentId,
              taskId,
              uploadedById: user.id,
              fileName: "report.pdf",
              contentType: "application/pdf",
              sizeBytes: 1024,
              storageKey,
              createdAt: now,
            }),
          ]);

          const found = await attachmentRepository.findById(db, attachmentId);
          expect(found).not.toBeNull();
          expect(found?.fileName).toBe("report.pdf");
          expect(found?.sizeBytes).toBe(1024);

          const list = await attachmentRepository.listByTaskIdWithUploader(db, taskId);
          expect(list).toHaveLength(1);
          expect(list[0]?.id).toBe(attachmentId);
          expect(list[0]?.uploaderName).toBe("Attachment Tester");
          expect(list[0]?.fileName).toBe("report.pdf");

          // Delete attachment
          await db.batch([attachmentRepository.deleteStmt(db, attachmentId)]);
          const afterDelete = await attachmentRepository.findById(db, attachmentId);
          expect(afterDelete).toBeNull();

          resolve();
        })
        .catch(reject);
    }));

  it("enforces CHECK (size_bytes BETWEEN 1 AND 10485760)", () =>
    new Promise<void>((resolve, reject) => {
      setupTask()
        .then(async ({ db, user, taskId, now }) => {
          // 1 byte succeeds
          const id1 = crypto.randomUUID();
          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: id1,
              taskId,
              uploadedById: user.id,
              fileName: "one.txt",
              contentType: "text/plain",
              sizeBytes: 1,
              storageKey: `key-${id1}`,
              createdAt: now,
            }),
          ]);

          // Exactly 10,485,760 bytes succeeds
          const idMax = crypto.randomUUID();
          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: idMax,
              taskId,
              uploadedById: user.id,
              fileName: "max.bin",
              contentType: "application/octet-stream",
              sizeBytes: 10485760,
              storageKey: `key-${idMax}`,
              createdAt: now,
            }),
          ]);

          // 0 bytes fails CHECK constraint
          const idZero = crypto.randomUUID();
          await expect(
            db.batch([
              attachmentRepository.insertStmt(db, {
                id: idZero,
                taskId,
                uploadedById: user.id,
                fileName: "zero.bin",
                contentType: "application/octet-stream",
                sizeBytes: 0,
                storageKey: `key-${idZero}`,
                createdAt: now,
              }),
            ]),
          ).rejects.toThrow();

          // 10,485,761 bytes fails CHECK constraint
          const idTooBig = crypto.randomUUID();
          await expect(
            db.batch([
              attachmentRepository.insertStmt(db, {
                id: idTooBig,
                taskId,
                uploadedById: user.id,
                fileName: "tooBig.bin",
                contentType: "application/octet-stream",
                sizeBytes: 10485761,
                storageKey: `key-${idTooBig}`,
                createdAt: now,
              }),
            ]),
          ).rejects.toThrow();

          resolve();
        })
        .catch(reject);
    }));

  it("enforces CHECK (length(file_name) BETWEEN 1 AND 255)", () =>
    new Promise<void>((resolve, reject) => {
      setupTask()
        .then(async ({ db, user, taskId, now }) => {
          // 1 char succeeds
          const id1 = crypto.randomUUID();
          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: id1,
              taskId,
              uploadedById: user.id,
              fileName: "a",
              contentType: "text/plain",
              sizeBytes: 10,
              storageKey: `key-${id1}`,
              createdAt: now,
            }),
          ]);

          // 255 chars succeeds
          const id255 = crypto.randomUUID();
          const name255 = "a".repeat(251) + ".txt";
          expect(name255.length).toBe(255);
          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: id255,
              taskId,
              uploadedById: user.id,
              fileName: name255,
              contentType: "text/plain",
              sizeBytes: 10,
              storageKey: `key-${id255}`,
              createdAt: now,
            }),
          ]);

          // 0 chars (empty) fails
          const idEmpty = crypto.randomUUID();
          await expect(
            db.batch([
              attachmentRepository.insertStmt(db, {
                id: idEmpty,
                taskId,
                uploadedById: user.id,
                fileName: "",
                contentType: "text/plain",
                sizeBytes: 10,
                storageKey: `key-${idEmpty}`,
                createdAt: now,
              }),
            ]),
          ).rejects.toThrow();

          // 256 chars fails
          const id256 = crypto.randomUUID();
          const name256 = "a".repeat(252) + ".txt";
          expect(name256.length).toBe(256);
          await expect(
            db.batch([
              attachmentRepository.insertStmt(db, {
                id: id256,
                taskId,
                uploadedById: user.id,
                fileName: name256,
                contentType: "text/plain",
                sizeBytes: 10,
                storageKey: `key-${id256}`,
                createdAt: now,
              }),
            ]),
          ).rejects.toThrow();

          resolve();
        })
        .catch(reject);
    }));

  it("enforces UNIQUE(storage_key)", () =>
    new Promise<void>((resolve, reject) => {
      setupTask()
        .then(async ({ db, user, taskId, now }) => {
          const duplicateKey = "projects/p1/tasks/t1/duplicate-key";
          const id1 = crypto.randomUUID();
          const id2 = crypto.randomUUID();

          await db.batch([
            attachmentRepository.insertStmt(db, {
              id: id1,
              taskId,
              uploadedById: user.id,
              fileName: "first.pdf",
              contentType: "application/pdf",
              sizeBytes: 100,
              storageKey: duplicateKey,
              createdAt: now,
            }),
          ]);

          await expect(
            db.batch([
              attachmentRepository.insertStmt(db, {
                id: id2,
                taskId,
                uploadedById: user.id,
                fileName: "second.pdf",
                contentType: "application/pdf",
                sizeBytes: 200,
                storageKey: duplicateKey,
                createdAt: now,
              }),
            ]),
          ).rejects.toThrow();

          resolve();
        })
        .catch(reject);
    }));

  it("uses idx_attachments_task when querying by task_id", () =>
    new Promise<void>((resolve, reject) => {
      setupTask()
        .then(async ({ db, taskId }) => {
          const result = await db.all<QueryPlanRow>(
            sql`EXPLAIN QUERY PLAN SELECT * FROM attachments WHERE task_id = ${taskId}`,
          );
          const plan = result.map((r) => r.detail).join("; ");
          expect(plan).toContain("idx_attachments_task");
          resolve();
        })
        .catch(reject);
    }));
  it("findExistingStorageKeys handles more keys than D1's 100 bound-parameter limit", async () => {
    const { db, user, taskId, now } = await setupTask();
    const realKeys = [crypto.randomUUID(), crypto.randomUUID()].map((id) => `projects/p1/tasks/${taskId}/${id}`);
    await db.batch(
      realKeys.map((storageKey, index) =>
        attachmentRepository.insertStmt(db, {
          id: storageKey.split("/").pop() ?? crypto.randomUUID(),
          taskId,
          uploadedById: user.id,
          fileName: `file-${index}.pdf`,
          contentType: "application/pdf",
          sizeBytes: 10,
          storageKey,
          createdAt: now,
        }),
      ) as [ReturnType<typeof attachmentRepository.insertStmt>],
    );

    // 250 keys: well past the 100-parameter cap, with the two real keys at the start and the end.
    const unknownKeys = Array.from({ length: 248 }, () => `projects/p1/tasks/${taskId}/${crypto.randomUUID()}`);
    const keys = [realKeys[0] ?? "", ...unknownKeys, realKeys[1] ?? ""];

    const found = await attachmentRepository.findExistingStorageKeys(db, keys);
    expect([...found].sort()).toEqual([...realKeys].sort());
  });
});
