import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import {
  commentRepository,
  createDatabase,
  notificationRepository,
  projectMemberRepository,
  projectRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@pm/domain";

import { commentService } from "../../app/services/comment.service";
import { taskService } from "../../app/services/task.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createActorContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "MEMBER",
  label?: string,
): Promise<{ ctx: RequestContext; user: { id: string; email: string; fullName: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `comment-svc-${role.toLowerCase()}-${id}@example.com`;
  const fullName = label ?? `User ${role}`;

  const created = await userRepository.insert(db, {
    id,
    email,
    fullName,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    db,
    env: { APP_BASE_URL: "http://localhost:5173" } as unknown as Cloudflare.Env,
    user: {
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      systemRole: created.systemRole,
      status: "ACTIVE",
    },
    requestId: "comment-svc-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, user: { id: created.id, email: created.email, fullName: created.fullName } };
}

async function setupProjectWorld() {
  const { ctx: pmCtx, user: pmUser } = await createActorContext("PM", "Project PM");
  const { ctx: leadCtx, user: leadUser } = await createActorContext("TEAM_LEAD", "Project Lead");
  const { ctx: creatorCtx, user: creatorUser } = await createActorContext("MEMBER", "Task Creator");
  const { ctx: assigneeCtx, user: assigneeUser } = await createActorContext("MEMBER", "Task Assignee");
  const { ctx: otherMemberCtx, user: otherMemberUser } = await createActorContext("MEMBER", "Other Member");
  const { ctx: adminCtx } = await createActorContext("ADMIN", "System Admin");
  const { ctx: outsiderCtx } = await createActorContext("MEMBER", "Outsider");

  const now = new Date();
  const projectId = crypto.randomUUID();

  const ensureDefaultStatus = async (
    category: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE",
    name: string,
    pos: number,
  ) => {
    const existing = await taskStatusRepository.findDefaultByCategory(pmCtx.db, category);
    if (existing) return existing;
    return taskStatusRepository.insert(pmCtx.db, {
      id: crypto.randomUUID(),
      name: `${name} ${crypto.randomUUID().slice(0, 6)}`,
      category,
      position: pos,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  };

  const todo = await ensureDefaultStatus("TODO", "To Do", 1);
  const inProgress = await ensureDefaultStatus("IN_PROGRESS", "In Progress", 2);
  const review = await ensureDefaultStatus("REVIEW", "Review", 3);
  const done = await ensureDefaultStatus("DONE", "Done", 4);

  await pmCtx.db.batch([
    projectRepository.insertStmt(pmCtx.db, {
      id: projectId,
      code: `CM${projectId.slice(0, 6).toUpperCase()}`,
      name: "Comment World Project",
      status: "ACTIVE",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      createdById: pmUser.id,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: pmUser.id,
      projectRole: "PM",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: leadUser.id,
      projectRole: "TEAM_LEAD",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: creatorUser.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: assigneeUser.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(pmCtx.db, {
      projectId,
      userId: otherMemberUser.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
  ]);

  // Creator creates task, then lead assigns BOTH creatorUser AND assigneeUser (tests deduplication!)
  const task = await taskService.createTask(creatorCtx, projectId, {
    title: "Discuss API Contract",
  });
  await taskService.assignTask(leadCtx, projectId, task.id, {
    version: 1,
    assigneeIds: [creatorUser.id, assigneeUser.id],
  });

  return {
    projectId,
    taskId: task.id,
    statuses: { todo, inProgress, review, done },
    pmCtx,
    pmUser,
    leadCtx,
    leadUser,
    creatorCtx,
    creatorUser,
    assigneeCtx,
    assigneeUser,
    otherMemberCtx,
    otherMemberUser,
    adminCtx,
    outsiderCtx,
  };
}

describe("commentService (FR-19 c1..c3, A21, A22)", () => {
  it("FR-19 c1 / A21: project member posts comment, notifying creator and assignees without duplicates and excluding the author", async () => {
    const world = await setupProjectWorld();

    const created = await commentService.addComment(world.otherMemberCtx, world.projectId, world.taskId, {
      body: "Please clarify the pagination cursor format.",
    });

    expect(created.body).toBe("Please clarify the pagination cursor format.");
    expect(created.parentCommentId).toBeNull();
    expect(created.authorId).toBe(world.otherMemberUser.id);
    expect(created.isDeleted).toBe(false);

    // Creator is ALSO an assignee -> must receive exactly 1 TASK_COMMENTED notification
    const creatorNotifications = (await notificationRepository.listByUser(world.pmCtx.db, world.creatorUser.id)).filter(
      (n) => n.type === "TASK_COMMENTED" && n.entityId === world.taskId,
    );
    expect(creatorNotifications).toHaveLength(1);
    expect(creatorNotifications[0]?.payload).toEqual({
      title: "Discuss API Contract",
      actorName: "Other Member",
    });

    const assigneeNotifications = (
      await notificationRepository.listByUser(world.pmCtx.db, world.assigneeUser.id)
    ).filter((n) => n.type === "TASK_COMMENTED" && n.entityId === world.taskId);
    expect(assigneeNotifications).toHaveLength(1);

    // Author receives 0 TASK_COMMENTED notifications
    const authorNotifications = (
      await notificationRepository.listByUser(world.pmCtx.db, world.otherMemberUser.id)
    ).filter((n) => n.type === "TASK_COMMENTED");
    expect(authorNotifications).toHaveLength(0);
  });

  it("FR-19 c1 / docs/09 §3.3: succeeds with zero notifications when author is the sole creator and assignee", async () => {
    const world = await setupProjectWorld();
    const soloTask = await taskService.createTask(world.leadCtx, world.projectId, {
      title: "Solo Task",
      assigneeIds: [world.leadUser.id],
    });

    const before = await notificationRepository.listByUser(world.leadCtx.db, world.leadUser.id);
    const comment = await commentService.addComment(world.leadCtx, world.projectId, soloTask.id, {
      body: "Self note on progress",
    });

    expect(comment.body).toBe("Self note on progress");
    const after = await notificationRepository.listByUser(world.leadCtx.db, world.leadUser.id);
    expect(after).toHaveLength(before.length);
  });

  it("FR-19 c1 / docs/09 §3.6: accepts 5000-character body and rejects empty or 5001-character body with 400", async () => {
    const world = await setupProjectWorld();

    const maxComment = await commentService.addComment(world.creatorCtx, world.projectId, world.taskId, {
      body: "v".repeat(5000),
    });
    expect(maxComment.body).toHaveLength(5000);

    await expect(
      commentService.addComment(world.creatorCtx, world.projectId, world.taskId, { body: "   " }),
    ).rejects.toThrow(ValidationError);

    await expect(
      commentService.addComment(world.creatorCtx, world.projectId, world.taskId, { body: "v".repeat(5001) }),
    ).rejects.toThrow(ValidationError);
  });

  it("FR-19 c2: attaches direct reply to root, re-points reply-to-reply to root (one level deep), and rejects cross-task parent", async () => {
    const world = await setupProjectWorld();

    let tick = Date.UTC(2026, 10, 18, 10, 0, 0);
    const clock = {
      now: () => {
        tick += 1000;
        return new Date(tick);
      },
    };
    world.creatorCtx.clock = clock;
    world.assigneeCtx.clock = clock;
    world.otherMemberCtx.clock = clock;

    const root = await commentService.addComment(world.creatorCtx, world.projectId, world.taskId, {
      body: "Root question",
    });

    const directReply = await commentService.addComment(world.assigneeCtx, world.projectId, world.taskId, {
      body: "Direct reply",
      parentCommentId: root.id,
    });
    expect(directReply.parentCommentId).toBe(root.id);

    // Reply to a reply -> re-pointed to root.id!
    const nestedReply = await commentService.addComment(world.otherMemberCtx, world.projectId, world.taskId, {
      body: "Reply to the reply",
      parentCommentId: directReply.id,
    });
    expect(nestedReply.parentCommentId).toBe(root.id);

    const details = await taskService.getTaskDetails(world.creatorCtx, world.projectId, world.taskId);
    expect(details.comments).toHaveLength(1);
    expect(details.comments[0]?.root.id).toBe(root.id);
    expect(details.comments[0]?.replies.map((r) => r.id)).toEqual([directReply.id, nestedReply.id]);

    // Cross-task parent comment is rejected with 400
    const otherTask = await taskService.createTask(world.creatorCtx, world.projectId, { title: "Other Task" });
    await expect(
      commentService.addComment(world.creatorCtx, world.projectId, otherTask.id, {
        body: "Cross-task reply attempt",
        parentCommentId: root.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("FR-19 c3 / A22: enforces delete permissions (author/PM/Admin allow; TEAM_LEAD/MEMBER 403), rejects second delete with 409, and keeps replies visible under deleted root", async () => {
    const world = await setupProjectWorld();

    const root = await commentService.addComment(world.creatorCtx, world.projectId, world.taskId, {
      body: "Root to be deleted",
    });
    const reply = await commentService.addComment(world.assigneeCtx, world.projectId, world.taskId, {
      body: "Reply that stays visible",
      parentCommentId: root.id,
    });
    const secondRoot = await commentService.addComment(world.assigneeCtx, world.projectId, world.taskId, {
      body: "Comment deleted by PM",
    });
    const thirdRoot = await commentService.addComment(world.assigneeCtx, world.projectId, world.taskId, {
      body: "Comment deleted by Admin",
    });

    // Non-author MEMBER and non-author TEAM_LEAD receive 403
    await expect(
      commentService.deleteComment(world.otherMemberCtx, world.projectId, world.taskId, { commentId: root.id }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      commentService.deleteComment(world.leadCtx, world.projectId, world.taskId, { commentId: root.id }),
    ).rejects.toThrow(ForbiddenError);

    // Author deletes root -> succeeds
    await commentService.deleteComment(world.creatorCtx, world.projectId, world.taskId, { commentId: root.id });

    // Second delete of the same comment hits conflictGuardStmt -> 409 ConflictError
    await expect(
      commentService.deleteComment(world.creatorCtx, world.projectId, world.taskId, { commentId: root.id }),
    ).rejects.toThrow(ConflictError);

    // Project PM and System Admin can delete another member's comments
    await commentService.deleteComment(world.pmCtx, world.projectId, world.taskId, { commentId: secondRoot.id });
    await commentService.deleteComment(world.adminCtx, world.projectId, world.taskId, { commentId: thirdRoot.id });

    // Verify deleted root masks body (null) and sets isDeleted=true while keeping reply intact
    const details = await taskService.getTaskDetails(world.otherMemberCtx, world.projectId, world.taskId);
    const firstThread = details.comments.find((t) => t.root.id === root.id);
    expect(firstThread?.root.isDeleted).toBe(true);
    expect(firstThread?.root.body).toBeNull();
    expect(firstThread?.root.canDelete).toBe(false);
    expect(firstThread?.replies).toHaveLength(1);
    expect(firstThread?.replies[0]?.id).toBe(reply.id);
    expect(firstThread?.replies[0]?.body).toBe("Reply that stays visible");
  });

  it("FR-23 c1 & FR-19 c1: surfaces rejection and reopen root comments from M4-T3 in task comment threads", async () => {
    const world = await setupProjectWorld();

    await taskService.changeStatus(world.creatorCtx, world.projectId, world.taskId, {
      statusId: world.statuses.review.id,
      version: 2,
    });
    await taskService.rejectTask(world.leadCtx, world.projectId, world.taskId, {
      version: 3,
      reason: "Rejected: missing null check",
    });

    const details = await taskService.getTaskDetails(world.creatorCtx, world.projectId, world.taskId);
    expect(details.comments).toHaveLength(1);
    expect(details.comments[0]?.root.body).toBe("Rejected: missing null check");
    expect(details.comments[0]?.root.authorId).toBe(world.leadUser.id);
  });

  it("P3 / FR-09 c4 / docs/05 §5.1: returns 404 for non-members, allows comments on DONE tasks, and rejects archived projects with 403 'This project is archived'", async () => {
    const world = await setupProjectWorld();

    // Non-member -> 404
    await expect(
      commentService.addComment(world.outsiderCtx, world.projectId, world.taskId, { body: "Outsider" }),
    ).rejects.toThrow(NotFoundError);

    // Move task to REVIEW and APPROVE to DONE -> commenting and deleting on DONE task are allowed
    await taskService.changeStatus(world.creatorCtx, world.projectId, world.taskId, {
      statusId: world.statuses.review.id,
      version: 2,
    });
    await taskService.approveTask(world.leadCtx, world.projectId, world.taskId, { version: 3 });

    const doneComment = await commentService.addComment(world.creatorCtx, world.projectId, world.taskId, {
      body: "Post-approval verification link attached",
    });
    expect(doneComment.body).toBe("Post-approval verification link attached");

    // Archive project -> Admin gets 403 "This project is archived" on both addComment and deleteComment
    await world.pmCtx.db.batch([projectRepository.archiveStmt(world.pmCtx.db, world.projectId, new Date())]);

    await expect(
      commentService.addComment(world.adminCtx, world.projectId, world.taskId, { body: "Archived write" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "This project is archived",
    });

    await expect(
      commentService.deleteComment(world.adminCtx, world.projectId, world.taskId, { commentId: doneComment.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "This project is archived",
    });
  });

  it("A21 forced batch failure (docs/09 §3.3): rolls back comment row when notification insert fails", async () => {
    const world = await setupProjectWorld();
    const commentsBefore = await commentRepository.listByTaskWithAuthor(world.pmCtx.db, world.taskId);

    const duplicateNotificationId = crypto.randomUUID();
    await world.pmCtx.db.batch([
      notificationRepository.insertStmt(world.pmCtx.db, {
        id: duplicateNotificationId,
        userId: world.creatorUser.id,
        type: "TASK_COMMENTED",
        entityId: world.taskId,
        projectId: world.projectId,
        payload: { title: "Seed", actorName: "Seed" },
        readAt: null,
        createdAt: new Date(),
      }),
    ]);

    const origInsertMany = notificationRepository.insertManyStmt.bind(notificationRepository);
    const spy = vi.spyOn(notificationRepository, "insertManyStmt").mockImplementationOnce((db, items) =>
      origInsertMany(
        db,
        items.map((item, idx) => (idx === 0 ? { ...item, id: duplicateNotificationId } : item)),
      ),
    );

    await expect(
      commentService.addComment(world.otherMemberCtx, world.projectId, world.taskId, {
        body: "Should roll back",
      }),
    ).rejects.toThrow();
    spy.mockRestore();

    const commentsAfter = await commentRepository.listByTaskWithAuthor(world.pmCtx.db, world.taskId);
    expect(commentsAfter).toHaveLength(commentsBefore.length);
  });
});
