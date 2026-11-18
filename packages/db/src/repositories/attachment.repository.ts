import { asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../client";
import { attachments, type AttachmentRow, type NewAttachmentRow } from "../schema/attachments";
import { users } from "../schema/users";

export interface AttachmentWithUploaderRow {
  id: string;
  taskId: string;
  uploadedById: string;
  uploaderName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

/** D1 rejects a single query with more than 100 bound parameters ("too many SQL variables"). */
const D1_MAX_BOUND_PARAMETERS = 100;

export const attachmentRepository = {
  insertStmt: (db: AppDatabase, data: NewAttachmentRow): BatchItem<"sqlite"> => {
    return db.insert(attachments).values(data);
  },

  deleteStmt: (db: AppDatabase, id: string): BatchItem<"sqlite"> => {
    return db.delete(attachments).where(eq(attachments.id, id));
  },

  findById: async (db: AppDatabase, id: string): Promise<AttachmentRow | null> => {
    const rows = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    return rows[0] ?? null;
  },

  listByTaskIdWithUploader: async (db: AppDatabase, taskId: string): Promise<AttachmentWithUploaderRow[]> => {
    const rows = await db
      .select({
        id: attachments.id,
        taskId: attachments.taskId,
        uploadedById: attachments.uploadedById,
        uploaderFullName: users.fullName,
        uploaderDeletedAt: users.deletedAt,
        fileName: attachments.fileName,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
        storageKey: attachments.storageKey,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedById, users.id))
      .where(eq(attachments.taskId, taskId))
      .orderBy(asc(attachments.createdAt));

    return rows.map((row) => {
      const isUploaderDeleted = row.uploaderDeletedAt !== null;
      const uploaderName = isUploaderDeleted || !row.uploaderFullName ? "Deleted user" : row.uploaderFullName;
      return {
        id: row.id,
        taskId: row.taskId,
        uploadedById: row.uploadedById,
        uploaderName,
        fileName: row.fileName,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        storageKey: row.storageKey,
        createdAt: row.createdAt,
      };
    });
  },

  /**
   * Returns which of `storageKeys` have an attachment row. D1 allows at most 100 bound parameters
   * per query, so the keys are looked up in chunks of `D1_MAX_BOUND_PARAMETERS`, whatever the caller's
   * batch size.
   */
  findExistingStorageKeys: async (db: AppDatabase, storageKeys: string[]): Promise<Set<string>> => {
    const found = new Set<string>();
    for (let start = 0; start < storageKeys.length; start += D1_MAX_BOUND_PARAMETERS) {
      const chunk = storageKeys.slice(start, start + D1_MAX_BOUND_PARAMETERS);
      const rows = await db
        .select({ storageKey: attachments.storageKey })
        .from(attachments)
        .where(inArray(attachments.storageKey, chunk));
      for (const row of rows) found.add(row.storageKey);
    }
    return found;
  },
};
