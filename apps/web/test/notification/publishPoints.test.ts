import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase, taskStatusRepository, type AppDatabase } from "@pm/db";

import { commentService } from "../../app/services/comment.service";
import { notificationService } from "../../app/services/notification.service";
import { projectService } from "../../app/services/project/project.service";
import { projectMemberService } from "../../app/services/project/projectMember.service";
import { taskService } from "../../app/services/task.service";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { createUser } from "../factories";

/**
 * docs/04 marks A4, A14, A17, A18, A19, and A21 as "publish": after commit, each must schedule
 * publishNotifications with exactly the notification IDs its batch wrote, and must not schedule it
 * when the batch wrote none (FR-26 c1, docs/07 §4).
 */
describe("realtime publish points (FR-26 c1, docs/04 publish column)", () => {
  let pending: Promise<unknown>[];
  let publishSpy: ReturnType<typeof vi.spyOn<typeof notificationService, "publishNotifications">>;

  beforeEach(() => {
    pending = [];
    publishSpy = vi.spyOn(notificationService, "publishNotifications").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function contextFor(db: AppDatabase, systemRole: "PM" | "MEMBER") {
    const user = await createUser(db, { systemRole, fullName: `Publish ${systemRole}` });
    const ctx: RequestContext = {
      env,
      db,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        systemRole: user.systemRole,
        status: "ACTIVE",
      },
      requestId: "publish-points",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: (promise) => {
        pending.push(promise);
      },
      clock: { now: () => new Date() },
    };
    return { ctx, user };
  }

  async function ensureWorkflowStatuses(db: AppDatabase) {
    const ensure = async (category: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE", position: number) => {
      const existing = await taskStatusRepository.findDefaultByCategory(db, category);
      if (existing) return existing;
      const now = new Date();
      return taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: `${category} ${crypto.randomUUID()}`,
        category,
        position,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    };
    return {
      todo: await ensure("TODO", 1),
      inProgress: await ensure("IN_PROGRESS", 2),
      review: await ensure("REVIEW", 3),
      done: await ensure("DONE", 4),
    };
  }

  async function fixture() {
    const db = createDatabase(env.DB);
    const lead = await contextFor(db, "PM");
    const member = await contextFor(db, "MEMBER");
    const member2 = await contextFor(db, "MEMBER");
    const statuses = await ensureWorkflowStatuses(db);
    const project = await projectService.createProject(lead.ctx, {
      code: `PB${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      name: "Publish Points Project",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
    });
    return { db, lead, member, member2, statuses, projectId: project.id };
  }

  async function addMembers(f: Awaited<ReturnType<typeof fixture>>) {
    for (const m of [f.member, f.member2]) {
      await projectMemberService.addMember(f.lead.ctx, f.projectId, { userId: m.user.id, projectRole: "MEMBER" });
    }
    await Promise.all(pending);
    pending.length = 0;
    publishSpy.mockClear();
  }

  /** Runs `operation` and returns the notification IDs it wrote plus every publish call it scheduled. */
  async function publishedDuring(db: AppDatabase, operation: () => Promise<unknown>) {
    const before = new Set((await db.query.notifications.findMany()).map((n) => n.id));
    publishSpy.mockClear();
    await operation();
    await Promise.all(pending);
    pending.length = 0;
    const written = (await db.query.notifications.findMany()).map((n) => n.id).filter((id) => !before.has(id));
    return { written: [...written].sort(), calls: publishSpy.mock.calls.map(([, ids]) => [...ids].sort()) };
  }

  function expectPublishedExactly(result: { written: string[]; calls: string[][] }) {
    expect(result.written.length).toBeGreaterThan(0);
    expect(result.calls).toEqual([result.written]);
  }

  it("A4: adding a member publishes their PROJECT_MEMBER_ADDED notification", async () => {
    const f = await fixture();
    const result = await publishedDuring(f.db, () =>
      projectMemberService.addMember(f.lead.ctx, f.projectId, { userId: f.member.user.id, projectRole: "MEMBER" }),
    );
    expectPublishedExactly(result);
  });

  it("A14: creating a task with assignees publishes their TASK_ASSIGNED notifications; none when unassigned", async () => {
    const f = await fixture();
    await addMembers(f);

    expectPublishedExactly(
      await publishedDuring(f.db, () =>
        taskService.createTask(f.lead.ctx, f.projectId, { title: "Assigned", assigneeIds: [f.member.user.id] }),
      ),
    );

    const unassigned = await publishedDuring(f.db, () =>
      taskService.createTask(f.lead.ctx, f.projectId, { title: "Unassigned" }),
    );
    expect(unassigned.written).toEqual([]);
    expect(unassigned.calls).toEqual([]);
  });

  it("A17: assigning publishes TASK_ASSIGNED for the newly added assignee only", async () => {
    const f = await fixture();
    await addMembers(f);
    const task = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Reassign me",
      assigneeIds: [f.member.user.id],
    });
    await Promise.all(pending);
    pending.length = 0;

    const result = await publishedDuring(f.db, () =>
      taskService.assignTask(f.lead.ctx, f.projectId, task.id, {
        version: task.version,
        assigneeIds: [f.member.user.id, f.member2.user.id],
      }),
    );
    expectPublishedExactly(result);
    expect(result.written).toHaveLength(1);
  });

  it("A18: approving publishes TASK_APPROVED for the assignees; none when the approver is the sole assignee", async () => {
    const f = await fixture();
    await addMembers(f);

    const task = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Approve me",
      assigneeIds: [f.member.user.id],
    });
    const inReview = await taskService.changeStatus(f.member.ctx, f.projectId, task.id, {
      statusId: f.statuses.review.id,
      version: task.version,
    });
    expectPublishedExactly(
      await publishedDuring(f.db, () =>
        taskService.approveTask(f.lead.ctx, f.projectId, task.id, { version: inReview.version }),
      ),
    );

    const own = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Self approve",
      assigneeIds: [f.lead.user.id],
    });
    const ownReview = await taskService.changeStatus(f.lead.ctx, f.projectId, own.id, {
      statusId: f.statuses.review.id,
      version: own.version,
    });
    const selfApproved = await publishedDuring(f.db, () =>
      taskService.approveTask(f.lead.ctx, f.projectId, own.id, { version: ownReview.version }),
    );
    expect(selfApproved.written).toEqual([]);
    expect(selfApproved.calls).toEqual([]);
  });

  it("A19: rejecting and reopening publish TASK_REJECTED and TASK_REOPENED for the assignees", async () => {
    const f = await fixture();
    await addMembers(f);
    const task = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Reject then reopen",
      assigneeIds: [f.member.user.id],
    });
    const review1 = await taskService.changeStatus(f.member.ctx, f.projectId, task.id, {
      statusId: f.statuses.review.id,
      version: task.version,
    });

    let rejectedVersion = 0;
    expectPublishedExactly(
      await publishedDuring(f.db, async () => {
        const rejected = await taskService.rejectTask(f.lead.ctx, f.projectId, task.id, {
          version: review1.version,
          reason: "Needs tests",
        });
        rejectedVersion = rejected.version;
      }),
    );

    const review2 = await taskService.changeStatus(f.member.ctx, f.projectId, task.id, {
      statusId: f.statuses.review.id,
      version: rejectedVersion,
    });
    const approved = await taskService.approveTask(f.lead.ctx, f.projectId, task.id, { version: review2.version });
    expectPublishedExactly(
      await publishedDuring(f.db, () =>
        taskService.reopenTask(f.lead.ctx, f.projectId, task.id, { version: approved.version, reason: "Regression" }),
      ),
    );
  });

  it("A21: commenting publishes TASK_COMMENTED for creator and assignees; none when nobody else is involved", async () => {
    const f = await fixture();
    await addMembers(f);
    const task = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Discuss",
      assigneeIds: [f.member.user.id],
    });
    expectPublishedExactly(
      await publishedDuring(f.db, () => commentService.addComment(f.member.ctx, f.projectId, task.id, { body: "Hi" })),
    );

    const solo = await taskService.createTask(f.lead.ctx, f.projectId, {
      title: "Solo",
      assigneeIds: [f.lead.user.id],
    });
    const soloComment = await publishedDuring(f.db, () =>
      commentService.addComment(f.lead.ctx, f.projectId, solo.id, { body: "Note to self" }),
    );
    expect(soloComment.written).toEqual([]);
    expect(soloComment.calls).toEqual([]);
  });
});
