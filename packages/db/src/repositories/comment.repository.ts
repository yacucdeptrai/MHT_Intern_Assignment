import { and, asc, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { comments, type CommentRow, type NewCommentRow } from "../schema/comments";

export const commentRepository = {
  insertStmt: (db: AppDatabase, comment: NewCommentRow) => {
    return db.insert(comments).values(comment);
  },

  findById: async (db: AppDatabase, id: string): Promise<CommentRow | undefined> => {
    return db.query.comments.findFirst({
      where: and(eq(comments.id, id), isNull(comments.deletedAt)),
    });
  },

  listByTaskId: async (db: AppDatabase, taskId: string): Promise<CommentRow[]> => {
    return db
      .select()
      .from(comments)
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
  },
};
