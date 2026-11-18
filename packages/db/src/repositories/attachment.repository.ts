import { asc, eq } from "drizzle-orm";
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
};
