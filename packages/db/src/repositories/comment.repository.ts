import { and, asc, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { comments, type CommentRow, type NewCommentRow } from "../schema/comments";
import { users } from "../schema/users";

export interface CommentWithAuthorRow {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  authorAvatarKey: string | null;
  parentCommentId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const commentRepository = {
  insertStmt: (db: AppDatabase, comment: NewCommentRow) => {
    return db.insert(comments).values(comment);
  },

  softDeleteStmt: (db: AppDatabase, id: string, now: Date) => {
    return db
      .update(comments)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)));
  },

  findById: async (db: AppDatabase, id: string): Promise<CommentRow | undefined> => {
    return db.query.comments.findFirst({
      where: and(eq(comments.id, id), isNull(comments.deletedAt)),
    });
  },

  findByIdIncludingDeleted: async (db: AppDatabase, id: string): Promise<CommentRow | undefined> => {
    return db.query.comments.findFirst({
      where: eq(comments.id, id),
    });
  },

  listByTaskId: async (db: AppDatabase, taskId: string): Promise<CommentRow[]> => {
    return db
      .select()
      .from(comments)
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
  },

  listByTaskWithAuthor: async (db: AppDatabase, taskId: string): Promise<CommentWithAuthorRow[]> => {
    const rows = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        authorId: comments.authorId,
        authorFullName: users.fullName,
        authorAvatarKey: users.avatarKey,
        authorDeletedAt: users.deletedAt,
        parentCommentId: comments.parentCommentId,
        body: comments.body,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt));

    return rows.map((row) => {
      const isAuthorDeleted = row.authorDeletedAt !== null;
      const authorName = isAuthorDeleted || !row.authorFullName ? "Deleted user" : row.authorFullName;
      return {
        id: row.id,
        taskId: row.taskId,
        authorId: row.authorId,
        authorName,
        authorAvatarKey: isAuthorDeleted ? null : row.authorAvatarKey,
        parentCommentId: row.parentCommentId,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
      };
    });
  },
};
