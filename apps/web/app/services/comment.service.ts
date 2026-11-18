import {
  commentRepository,
  compactBatch,
  conflictGuardStmt,
  isVersionConflict,
  notificationRepository,
  taskAssigneeRepository,
  taskRepository,
  type CommentWithAuthorRow,
} from "@pm/db";
import {
  canCreateComment,
  canDeleteComment,
  CommentCreateSchema,
  CommentIdSchema,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  toActor,
  UnauthorizedError,
  ValidationError,
  type ActorContext,
  type CommentDto,
  type CommentThread,
} from "@pm/domain";

import { loadProjectAccess } from "../utils/auth.server";
import type { RequestContext } from "../utils/requestContext.server";

function mapRowToCommentDto(row: CommentWithAuthorRow, actor: ActorContext): CommentDto {
  const isDeleted = row.deletedAt !== null;
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatarKey: row.authorAvatarKey,
    parentCommentId: row.parentCommentId,
    body: isDeleted ? null : row.body,
    isDeleted,
    canDelete: !isDeleted && canDeleteComment(actor, { authorId: row.authorId }),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function buildCommentThreads(rows: readonly CommentWithAuthorRow[], actor: ActorContext): CommentThread[] {
  const threads: CommentThread[] = [];
  const threadByRootId = new Map<string, CommentThread>();

  for (const row of rows) {
    if (row.parentCommentId === null) {
      const thread: CommentThread = {
        root: mapRowToCommentDto(row, actor),
        replies: [],
      };
      threads.push(thread);
      threadByRootId.set(row.id, thread);
    }
  }

  for (const row of rows) {
    if (row.parentCommentId !== null) {
      const parentThread = threadByRootId.get(row.parentCommentId);
      if (parentThread) {
        parentThread.replies.push(mapRowToCommentDto(row, actor));
      }
    }
  }

  return threads;
}

export const commentService = {
  async addComment(ctx: RequestContext, projectId: string, taskId: string, rawInput: unknown): Promise<CommentDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canCreateComment(actor)) {
      throw new ForbiddenError("You do not have permission to comment on this task");
    }

    const task = await taskRepository.findById(ctx.db, taskId);
    if (!task || task.projectId !== projectId || task.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    const parsed = CommentCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid comment data", fieldErrors);
    }

    const data = parsed.data;
    let effectiveParentId: string | null = null;

    if (data.parentCommentId !== null) {
      const parent = await commentRepository.findByIdIncludingDeleted(ctx.db, data.parentCommentId);
      if (!parent || parent.taskId !== taskId) {
        throw new ValidationError("Parent comment not found", {
          parentCommentId: ["Parent comment not found"],
        });
      }
      if (parent.deletedAt !== null && parent.parentCommentId !== null) {
        throw new ValidationError("Cannot reply to a deleted comment", {
          parentCommentId: ["Cannot reply to a deleted comment"],
        });
      }
      // FR-19 c2: re-point a reply-to-reply to the root comment so threads stay one level deep
      effectiveParentId = parent.parentCommentId ?? parent.id;
    }

    const assigneeIds = await taskAssigneeRepository.findUserIdsByTaskId(ctx.db, taskId);
    const recipientIds = new Set<string>([task.createdById, ...assigneeIds]);
    recipientIds.delete(currentUser.id);

    const now = ctx.clock.now();
    const commentId = crypto.randomUUID();
    const notifications = Array.from(recipientIds).map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      type: "TASK_COMMENTED" as const,
      entityId: taskId,
      projectId,
      payload: {
        title: task.title,
        actorName: currentUser.fullName,
      },
      readAt: null,
      createdAt: now,
    }));

    // A21: insert comments; insert notifications TASK_COMMENTED (creator and assignees, excluding author)
    await ctx.db.batch(
      compactBatch([
        commentRepository.insertStmt(ctx.db, {
          id: commentId,
          taskId,
          authorId: currentUser.id,
          parentCommentId: effectiveParentId,
          body: data.body,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
        notificationRepository.insertManyStmt(ctx.db, notifications),
      ]),
    );

    // TODO(M6-T2): publishNotifications after commit (A21 TASK_COMMENTED)
    ctx.logger.info("Task comment added", {
      taskId,
      projectId,
      commentId,
      parentCommentId: effectiveParentId,
      userId: currentUser.id,
      requestId: ctx.requestId,
    });

    return {
      id: commentId,
      taskId,
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      authorAvatarKey: currentUser.avatarKey ?? null,
      parentCommentId: effectiveParentId,
      body: data.body,
      isDeleted: false,
      canDelete: canDeleteComment(actor, { authorId: currentUser.id }),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    };
  },

  async deleteComment(ctx: RequestContext, projectId: string, taskId: string, rawInput: unknown): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const task = await taskRepository.findById(ctx.db, taskId);
    if (!task || task.projectId !== projectId || task.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    const parsed = CommentIdSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid comment delete request", fieldErrors);
    }

    const existing = await commentRepository.findByIdIncludingDeleted(ctx.db, parsed.data.commentId);
    if (!existing || existing.taskId !== taskId) {
      throw new NotFoundError("Comment not found");
    }

    const actor = toActor(currentUser, access);
    if (!canDeleteComment(actor, { authorId: existing.authorId })) {
      throw new ForbiddenError("You do not have permission to delete this comment");
    }

    const now = ctx.clock.now();
    try {
      // A22: update comments.deleted_at; guard
      await ctx.db.batch([commentRepository.softDeleteStmt(ctx.db, existing.id, now), conflictGuardStmt(ctx.db)]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Comment has already been deleted");
      }
      throw error;
    }

    ctx.logger.info("Task comment deleted", {
      taskId,
      projectId,
      commentId: existing.id,
      userId: currentUser.id,
      requestId: ctx.requestId,
    });
  },
};
