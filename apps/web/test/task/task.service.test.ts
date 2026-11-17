import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  auditLogRepository,
  createDatabase,
  notificationRepository,
  outboxJobRepository,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { NotFoundError, ValidationError } from "@pm/domain";

import { taskService } from "../../app/services/task.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createTestContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "MEMBER",
): Promise<{ ctx: RequestContext; user: { id: string; email: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `user-${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`;

  const user = await userRepository.insert(db, {
    id,
    email,
    fullName: `Test ${role}`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    db,
    env: {} as unknown as Cloudflare.Env,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "test-req-id",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, user };
}

async function createProjectWithMembers(ctx: RequestContext) {
  const now = new Date();
  const projectId = crypto.randomUUID();

  await ctx.db.batch([
    projectRepository.insertStmt(ctx.db, {
      id: projectId,
      code: `PRJ${Date.now().toString().slice(-6)}`,
      name: "Task Testing Project",
      status: "ACTIVE",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      createdById: ctx.user?.id ?? "",
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  // Ensure default TODO status exists
  let status = await taskStatusRepository.findDefaultByCategory(ctx.db, "TODO");
  if (!status) {
    status = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `To Do ${Date.now()}`,
      category: "TODO",
      position: 1,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { projectId, defaultStatus: status };
}

describe("taskService.createTask", () => {
  it("FR-12 c1 / A14: project member creates top-level task atomically in default TODO status, audits TASK_CREATED, and queues SLACK_POST_TASK", async () => {
    const { ctx, user } = await createTestContext("MEMBER");
    const { projectId, defaultStatus } = await createProjectWithMembers(ctx);

    // Add user as regular MEMBER
    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const created = await taskService.createTask(ctx, projectId, {
      title: "Write documentation",
      description: "Write initial documentation",
      priority: "HIGH",
    });

    expect(created.id).toBeDefined();
    expect(created.number).toBe(1);
    expect(created.title).toBe("Write documentation");
    expect(created.description).toBe("Write initial documentation");
    expect(created.priority).toBe("HIGH");
    expect(created.statusId).toBe(defaultStatus.id);
    expect(created.createdById).toBe(user.id);
    expect(created.version).toBe(1);

    // Verify audit log
    const auditLogs = await auditLogRepository.listByProject(ctx.db, projectId);
    const taskCreatedLog = auditLogs.find((l) => l.action === "TASK_CREATED" && l.entityId === created.id);
    expect(taskCreatedLog).toBeDefined();
    expect(taskCreatedLog?.actorId).toBe(user.id);

    // Verify SLACK_POST_TASK outbox job
    const outboxJobs = await outboxJobRepository.listDue(ctx.db, new Date(Date.now() + 1000), 100);
    const slackJob = outboxJobs.find((j) => {
      if (j.type !== "SLACK_POST_TASK") return false;
      const payload = JSON.parse(j.payload) as { taskId?: string };
      return payload.taskId === created.id;
    });
    expect(slackJob).toBeDefined();
  });

  it("FR-12 c1 / A14: project lead creates task with assignees, records assignments and TASK_ASSIGNED notifications", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("MEMBER");
    const { user: memberUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    // Lead is PM on project, memberUser is MEMBER
    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const created = await taskService.createTask(leadCtx, projectId, {
      title: "Assigned Task",
      priority: "MEDIUM",
      assigneeIds: [memberUser.id],
    });

    expect(created.assignees).toEqual([memberUser.id]);

    // Check task_assignees table
    const assignees = await taskAssigneeRepository.findByTaskId(leadCtx.db, created.id);
    expect(assignees.length).toBe(1);
    expect(assignees[0]?.userId).toBe(memberUser.id);

    // Check notification was written for memberUser
    const notifications = await notificationRepository.listByUser(leadCtx.db, memberUser.id);
    const assignedNotification = notifications.find((n) => n.type === "TASK_ASSIGNED");
    expect(assignedNotification).toBeDefined();
  });

  it("FR-12 c1: sub-task creation does not queue SLACK_POST_TASK", async () => {
    const { ctx, user } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const parent = await taskService.createTask(ctx, projectId, {
      title: "Parent Task",
    });

    const subTask = await taskService.createTask(ctx, projectId, {
      title: "Sub Task",
      parentTaskId: parent.id,
    });

    expect(subTask.parentTaskId).toBe(parent.id);

    // Verify no SLACK_POST_TASK for subTask
    const outboxJobs = await outboxJobRepository.listDue(ctx.db, new Date(Date.now() + 1000), 100);
    const subTaskJob = outboxJobs.find((j) => {
      if (j.type !== "SLACK_POST_TASK") return false;
      const payload = JSON.parse(j.payload) as { taskId?: string };
      return payload.taskId === subTask.id;
    });
    expect(subTaskJob).toBeUndefined();
  });

  it("FR-12 c2: returns ValidationError when due date is before start date", async () => {
    const { ctx, user } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    await expect(
      taskService.createTask(ctx, projectId, {
        title: "Invalid dates task",
        startDate: "2026-12-15",
        dueDate: "2026-12-10",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("FR-12 c3: non-member receives 404 NotFoundError", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(ctx);

    // User is NOT added as a member
    await expect(
      taskService.createTask(ctx, projectId, {
        title: "Non-member attempt",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("P8: regular member providing assignees receives 403 ForbiddenError", async () => {
    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    const { user: otherUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(memberCtx);

    await memberCtx.db.batch([
      projectMemberRepository.insertStmt(memberCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(memberCtx.db, {
        projectId,
        userId: otherUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    await expect(
      taskService.createTask(memberCtx, projectId, {
        title: "Member assigning task",
        assigneeIds: [otherUser.id],
      }),
    ).rejects.toThrow("Only project leads and admins can assign tasks");
  });

  it("FR-15: non-project-member in assignees is rejected with 400 ValidationError", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("MEMBER");
    const { user: outsider } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    await expect(
      taskService.createTask(leadCtx, projectId, {
        title: "Assigning outsider",
        assigneeIds: [outsider.id],
      }),
    ).rejects.toThrow("Assignees must be project members");
  });

  it("FR-36 c3: sprint from another project is rejected with 400 ValidationError", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("MEMBER");
    const { projectId: projectA } = await createProjectWithMembers(leadCtx);
    const { projectId: projectB } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId: projectA,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const sprintB = await sprintRepository.insert(leadCtx.db, {
      id: crypto.randomUUID(),
      projectId: projectB,
      name: "Sprint on Project B",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      taskService.createTask(leadCtx, projectA, {
        title: "Cross project sprint task",
        sprintId: sprintB.id,
      }),
    ).rejects.toThrow("Sprint does not belong to this project");
  });

  it("archived project rejects task creation with 403 This project is archived", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    // Archive the project
    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(
      taskService.createTask(adminCtx, projectId, {
        title: "Task on archived project",
      }),
    ).rejects.toThrow("This project is archived");
  });
});
