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
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@pm/domain";

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

  it("unauthenticated user throws UnauthorizedError", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(ctx);
    const unauthCtx = { ...ctx, user: null };

    await expect(
      taskService.createTask(unauthCtx, projectId, {
        title: "Unauth task",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("non-member on active project throws NotFoundError (never 403)", async () => {
    const { ctx: creatorCtx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(creatorCtx);

    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");
    await expect(
      taskService.createTask(nonMemberCtx, projectId, {
        title: "Non-member task",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("parent task from another project throws ValidationError", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId: projectA } = await createProjectWithMembers(adminCtx);
    const { projectId: projectB } = await createProjectWithMembers(adminCtx);

    const parentTask = await taskService.createTask(adminCtx, projectB, {
      title: "Parent in Project B",
    });

    await expect(
      taskService.createTask(adminCtx, projectA, {
        title: "Child in Project A",
        parentTaskId: parentTask.id,
      }),
    ).rejects.toThrow("Parent task not found in this project");
  });

  it("FR-17 c1: member creates sub-task inheriting parent's project and sprint, ignoring client sprint", async () => {
    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(memberCtx);

    await memberCtx.db.batch([
      projectMemberRepository.insertStmt(memberCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const sprint = await sprintRepository.insert(adminCtx.db, {
      id: crypto.randomUUID(),
      projectId,
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-15",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const parentTask = await taskService.createTask(adminCtx, projectId, {
      title: "Parent with sprint",
      sprintId: sprint.id,
    });

    const subTask = await taskService.createTask(memberCtx, projectId, {
      title: "Sub-task inheriting sprint",
      parentTaskId: parentTask.id,
      sprintId: crypto.randomUUID(),
    });

    expect(subTask.parentTaskId).toBe(parentTask.id);
    expect(subTask.sprintId).toBe(sprint.id);
  });

  it("FR-17 c2: rejects sub-task of a sub-task with 400 'Sub-tasks cannot have sub-tasks'", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    const topTask = await taskService.createTask(adminCtx, projectId, {
      title: "Top task",
    });

    const subTask = await taskService.createTask(adminCtx, projectId, {
      title: "Sub-task",
      parentTaskId: topTask.id,
    });

    await expect(
      taskService.createTask(adminCtx, projectId, {
        title: "Grandchild task",
        parentTaskId: subTask.id,
      }),
    ).rejects.toMatchObject({
      message: "Sub-tasks cannot have sub-tasks",
    });
  });

  it("FR-17 c3: sub-task permissions follow P8 evaluated on the sub-task itself", async () => {
    const { ctx: creatorCtx, user: creatorUser } = await createTestContext("MEMBER");
    const { ctx: memberBCtx, user: memberBUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(creatorCtx);

    await creatorCtx.db.batch([
      projectMemberRepository.insertStmt(creatorCtx.db, {
        projectId,
        userId: creatorUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(creatorCtx.db, {
        projectId,
        userId: memberBUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const parentTask = await taskService.createTask(creatorCtx, projectId, {
      title: "Parent Task",
    });

    // Member B creates a sub-task under parent
    const subTask = await taskService.createTask(memberBCtx, projectId, {
      title: "Sub-task created by Member B",
      parentTaskId: parentTask.id,
    });

    // Creator of sub-task (Member B) CAN edit sub-task
    const updated = await taskService.updateTask(memberBCtx, projectId, subTask.id, {
      version: 1,
      title: "Updated Sub-task by B",
    });
    expect(updated.title).toBe("Updated Sub-task by B");

    // Parent creator who is not lead or assignee of sub-task CANNOT edit sub-task (403)
    await expect(
      taskService.updateTask(creatorCtx, projectId, subTask.id, {
        version: 2,
        title: "Creator trying to edit subtask",
      }),
    ).rejects.toMatchObject({ status: 403 });
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

describe("taskService.listProjectTasks", () => {
  it("unauthenticated user throws UnauthorizedError", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(ctx);
    const unauthCtx = { ...ctx, user: null };

    await expect(taskService.listProjectTasks(unauthCtx, projectId, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("non-member on active project throws NotFoundError", async () => {
    const { ctx: creatorCtx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(creatorCtx);

    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");
    await expect(taskService.listProjectTasks(nonMemberCtx, projectId, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archived project throws ForbiddenError", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(taskService.listProjectTasks(adminCtx, projectId, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists project tasks with filters", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    const sprint = await sprintRepository.insert(adminCtx.db, {
      id: crypto.randomUUID(),
      projectId,
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Sprint Task",
      sprintId: sprint.id,
      priority: "HIGH",
    });

    const result = await taskService.listProjectTasks(adminCtx, projectId, {
      sprintId: sprint.id,
      priority: "HIGH",
      page: 1,
      pageSize: 10,
    });

    expect(result.tasks.items.length).toBe(1);
    expect(result.tasks.items[0]?.id).toBe(task.id);
    expect(result.sprints.length).toBeGreaterThanOrEqual(1);
  });
});

describe("taskService.listMyTasks", () => {
  it("unauthenticated user throws UnauthorizedError", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const unauthCtx = { ...ctx, user: null };

    await expect(taskService.listMyTasks(unauthCtx, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("non-admin with 0 memberships returns empty items", async () => {
    const { ctx: memberCtx } = await createTestContext("MEMBER");

    const result = await taskService.listMyTasks(memberCtx, {});
    expect(result.tasks.items).toEqual([]);
    expect(result.tasks.total).toBe(0);
    expect(result.projects).toEqual([]);
  });

  it("admin lists accessible projects and personal tasks with dueRange filter", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);
    const adminId = adminCtx.user?.id ?? "";

    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminId,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Admin Assigned Task",
      assigneeIds: [adminId],
      dueDate: "2026-11-20",
      priority: "URGENT",
    });

    const result = await taskService.listMyTasks(adminCtx, {
      dueRange: "all",
      priority: "URGENT",
    });

    expect(result.projects.length).toBeGreaterThanOrEqual(1);
    expect(result.tasks.items.some((t) => t.id === task.id)).toBe(true);
  });
});

describe("taskService.getTaskDetails", () => {
  it("FR-13 c1: returns task details, assignees, subtasks, metadata, and permissions", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId, defaultStatus } = await createProjectWithMembers(adminCtx);
    const adminId = adminCtx.user?.id ?? "";

    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminId,
        projectRole: "PM",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const parentTask = await taskService.createTask(adminCtx, projectId, {
      title: "Parent Task for Detail",
      description: "Detailed description",
      priority: "HIGH",
      assigneeIds: [memberUser.id],
    });

    const subTask = await taskService.createTask(adminCtx, projectId, {
      title: "Child Subtask",
      parentTaskId: parentTask.id,
      priority: "LOW",
    });

    const detail = await taskService.getTaskDetails(memberCtx, projectId, parentTask.id);
    expect(detail.task.id).toBe(parentTask.id);
    expect(detail.task.title).toBe("Parent Task for Detail");
    expect(detail.task.description).toBe("Detailed description");
    expect(detail.task.statusId).toBe(defaultStatus.id);
    expect(detail.task.assignees.length).toBe(1);
    expect(detail.task.assignees[0]?.id).toBe(memberUser.id);
    expect(detail.subTasks.length).toBe(1);
    expect(detail.subTasks[0]?.id).toBe(subTask.id);
    // Member is assignee, so canEdit is true
    expect(detail.permissions.canEdit).toBe(true);
    expect(detail.permissions.canAssign).toBe(false); // Member cannot assign
  });

  it("throws NotFoundError when task does not exist or is deleted", async () => {
    const { ctx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(ctx);
    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: ctx.user?.id ?? "",
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    await expect(taskService.getTaskDetails(ctx, projectId, crypto.randomUUID())).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when requester is not a project member", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);
    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Secret Task",
    });

    await expect(taskService.getTaskDetails(nonMemberCtx, projectId, task.id)).rejects.toThrow(NotFoundError);
  });

  it("throws UnauthorizedError when requester is unauthenticated", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const unauthCtx = { ...ctx, user: null };

    await expect(taskService.getTaskDetails(unauthCtx, "p-1", "t-1")).rejects.toThrow(UnauthorizedError);
  });
});

describe("taskService.updateTask", () => {
  it("FR-13 c1 / A15: allowed editor saves changes with version, updates task, increments version, and audits TASK_UPDATED", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);
    const adminId = adminCtx.user?.id ?? "";

    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminId,
        projectRole: "PM",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    // Member creates task -> member is creator
    const task = await taskService.createTask(memberCtx, projectId, {
      title: "Original Title",
      description: "Original Description",
      priority: "MEDIUM",
      startDate: "2026-12-01",
      dueDate: "2026-12-10",
    });

    expect(task.version).toBe(1);

    // Member updates the task
    const updated = await taskService.updateTask(memberCtx, projectId, task.id, {
      version: 1,
      title: "New Title",
      description: "New Description",
      priority: "HIGH",
      startDate: "2026-12-02",
      dueDate: "2026-12-12",
    });

    expect(updated.title).toBe("New Title");
    expect(updated.description).toBe("New Description");
    expect(updated.priority).toBe("HIGH");
    expect(updated.version).toBe(2);

    // Verify audit log
    const logs = await auditLogRepository.listByEntity(adminCtx.db, "TASK", task.id);
    const updateLog = logs.find((l) => l.action === "TASK_UPDATED");
    expect(updateLog).toBeDefined();
    expect(updateLog?.actorId).toBe(memberUser.id);
    expect(updateLog?.changes?.title).toEqual({ from: "Original Title", to: "New Title" });
    expect(updateLog?.changes?.priority).toEqual({ from: "MEDIUM", to: "HIGH" });
  });

  it("FR-13 c2: stale version returns 409 ConflictError and nothing is written", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);
    const adminId = adminCtx.user?.id ?? "";

    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminId,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Task Concurrent Test",
    });

    // First update: bumps version to 2
    await taskService.updateTask(adminCtx, projectId, task.id, {
      version: 1,
      title: "Updated First",
    });

    // Second update with stale version 1 must throw ConflictError
    await expect(
      taskService.updateTask(adminCtx, projectId, task.id, {
        version: 1,
        title: "Conflicting Update",
      }),
    ).rejects.toThrow(ConflictError);

    // Verify task title is still "Updated First"
    const loaded = await taskRepository.findById(adminCtx.db, task.id);
    expect(loaded?.title).toBe("Updated First");
    expect(loaded?.version).toBe(2);
  });

  it("FR-13 c3: project member who is neither creator nor assignee receives 403 ForbiddenError", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(leadCtx);

    const { ctx: otherMemberCtx, user: otherMember } = await createTestContext("MEMBER");

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: otherMember.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    // Lead creates task without assigning otherMember
    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Lead Only Task",
    });

    // otherMember tries to edit -> 403 Forbidden
    await expect(
      taskService.updateTask(otherMemberCtx, projectId, task.id, {
        version: 1,
        title: "Hacked Title",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("FR-13 c4: task in DONE status rejected with 403 ForbiddenError('Reopen the task to edit it') for everyone including leads", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(leadCtx);

    // Create a DONE status
    const doneStatus = await taskStatusRepository.insert(leadCtx.db, {
      id: crypto.randomUUID(),
      name: `Done ${Date.now()}`,
      category: "DONE",
      position: 99,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Completed Work",
    });

    // Move task to DONE status directly via updateStatusStmt
    await leadCtx.db.batch([
      taskRepository.updateStatusStmt(leadCtx.db, {
        id: task.id,
        expectedVersion: 1,
        statusId: doneStatus.id,
        now: new Date(),
      }),
    ]);

    // Lead tries to update frozen task
    await expect(
      taskService.updateTask(leadCtx, projectId, task.id, {
        version: 2,
        title: "Trying to edit completed work",
      }),
    ).rejects.toThrow("Reopen the task to edit it");
  });

  it("FR-36 c2: changing parent sprint cascades sprintId to subtasks", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(leadCtx);

    const sprint = await sprintRepository.insert(leadCtx.db, {
      id: crypto.randomUUID(),
      projectId,
      name: "Sprint 1",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const parent = await taskService.createTask(leadCtx, projectId, {
      title: "Parent with Subtasks",
    });

    const subtask = await taskService.createTask(leadCtx, projectId, {
      title: "Subtask 1",
      parentTaskId: parent.id,
    });

    expect(subtask.sprintId).toBeNull();

    // Update parent sprint
    await taskService.updateTask(leadCtx, projectId, parent.id, {
      version: 1,
      sprintId: sprint.id,
    });

    // Subtask should have received the sprint!
    const updatedSubtask = await taskRepository.findById(leadCtx.db, subtask.id);
    expect(updatedSubtask?.sprintId).toBe(sprint.id);
  });

  it("FR-36 c3: sprint from another project rejected with 400 ValidationError", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(leadCtx);
    const { projectId: otherProjectId } = await createProjectWithMembers(leadCtx);

    const foreignSprint = await sprintRepository.insert(leadCtx.db, {
      id: crypto.randomUUID(),
      projectId: otherProjectId,
      name: "Foreign Sprint",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task with foreign sprint attempt",
    });

    await expect(
      taskService.updateTask(leadCtx, projectId, task.id, {
        version: 1,
        sprintId: foreignSprint.id,
      }),
    ).rejects.toThrow("Sprint does not belong to this project");
  });

  it("rejects date order violation combining updated date with existing date", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    // Existing task has start date 2026-12-10
    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task with start date",
      startDate: "2026-12-10",
    });

    // Update only dueDate to 2026-12-05 (before existing startDate)
    await expect(
      taskService.updateTask(leadCtx, projectId, task.id, {
        version: 1,
        dueDate: "2026-12-05",
      }),
    ).rejects.toThrow("Due date must be on or after start date");
  });

  it("throws ForbiddenError when updating task in archived project", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminCtx.user?.id ?? "",
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Task to archive",
    });

    // Archive project
    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(
      taskService.updateTask(adminCtx, projectId, task.id, {
        version: 1,
        title: "Archived Project Edit",
      }),
    ).rejects.toThrow("This project is archived");
  });
});

describe("taskService.assignTask (FR-15)", () => {
  it("FR-15 c1 / A17: project TEAM_LEAD assigns task atomically, increments version, audits TASK_ASSIGNED, and creates notifications for newly added assignees", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { ctx: memberACtx, user: memberA } = await createTestContext("MEMBER");
    const { user: memberB } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    const now = new Date();
    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: memberA.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: memberB.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const task = await taskService.createTask(memberACtx, projectId, {
      title: "Task for assignment test",
    });
    expect(task.version).toBe(1);
    expect(task.assignees).toEqual([]);

    // 1. Assign to memberA
    const assigned1 = await taskService.assignTask(leadCtx, projectId, task.id, {
      version: 1,
      assigneeIds: [memberA.id],
    });

    expect(assigned1.version).toBe(2);
    expect(assigned1.assignees.map((a) => a.id)).toEqual([memberA.id]);

    // Check DB state for first assignment
    const assigneesInDb1 = await taskAssigneeRepository.findUserIdsByTaskId(leadCtx.db, task.id);
    expect(assigneesInDb1).toEqual([memberA.id]);

    const notifications1 = await notificationRepository.listByUser(leadCtx.db, memberA.id);
    const assignNotification1 = notifications1.find((n) => n.entityId === task.id && n.type === "TASK_ASSIGNED");
    expect(assignNotification1).toBeDefined();

    // 2. Assign to memberA and memberB (memberB is newly added)
    const assigned2 = await taskService.assignTask(leadCtx, projectId, task.id, {
      version: 2,
      assigneeIds: [memberA.id, memberB.id],
    });

    expect(assigned2.version).toBe(3);
    expect(assigned2.assignees.map((a) => a.id)).toEqual(expect.arrayContaining([memberA.id, memberB.id]));

    // Check notifications: memberB receives notification, memberA does not receive a second one
    const notificationsB = await notificationRepository.listByUser(leadCtx.db, memberB.id);
    const assignNotificationB = notificationsB.find((n) => n.entityId === task.id && n.type === "TASK_ASSIGNED");
    expect(assignNotificationB).toBeDefined();

    const notificationsAAfter = await notificationRepository.listByUser(leadCtx.db, memberA.id);
    const assignNotificationsA = notificationsAAfter.filter(
      (n) => n.entityId === task.id && n.type === "TASK_ASSIGNED",
    );
    expect(assignNotificationsA.length).toBe(1);
  });

  it("FR-15 c1: clearing all assignees removes task assignees and increments version", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { user: member } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    const now = new Date();
    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: member.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task with assignee to clear",
      assigneeIds: [member.id],
    });
    expect(task.assignees).toEqual([member.id]);

    const unassigned = await taskService.assignTask(leadCtx, projectId, task.id, {
      version: 1,
      assigneeIds: [],
    });
    expect(unassigned.version).toBe(2);
    expect(unassigned.assignees).toEqual([]);

    const dbAssignees = await taskAssigneeRepository.findUserIdsByTaskId(leadCtx.db, task.id);
    expect(dbAssignees).toEqual([]);
  });

  it("FR-15 c2: rejects non-member assignee with 400 'Assignees must be project members'", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { user: nonMember } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task for non-member test",
    });

    await expect(
      taskService.assignTask(leadCtx, projectId, task.id, {
        version: 1,
        assigneeIds: [nonMember.id],
      }),
    ).rejects.toThrow("Assignees must be project members");
  });

  it("FR-15 c3: rejects project MEMBER with 403", async () => {
    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(memberCtx);

    await memberCtx.db.batch([
      projectMemberRepository.insertStmt(memberCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(memberCtx, projectId, {
      title: "Task for permission test",
    });

    await expect(
      taskService.assignTask(memberCtx, projectId, task.id, {
        version: 1,
        assigneeIds: [memberUser.id],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("A17: returns ConflictError 409 when stale version is provided", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task for conflict test",
    });

    // Provide stale version 99
    await expect(
      taskService.assignTask(leadCtx, projectId, task.id, {
        version: 99,
        assigneeIds: [],
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "This task was changed by someone else. Reload to see the latest version.",
    });
  });

  it("rejects with 404 when non-member calls assignTask", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task for 404 test",
    });

    await expect(
      taskService.assignTask(nonMemberCtx, projectId, task.id, {
        version: 1,
        assigneeIds: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 403 when assigning task in archived project", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminCtx.user?.id ?? "",
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Task in archived project",
    });

    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(
      taskService.assignTask(adminCtx, projectId, task.id, {
        version: 1,
        assigneeIds: [],
      }),
    ).rejects.toMatchObject({ status: 403, message: "This project is archived" });
  });
});

describe("taskService.archiveTask", () => {
  it("FR-14 c1 / A20: creator archives task with sub-tasks, soft-deleting both and auditing TASK_ARCHIVED", async () => {
    const { ctx: creatorCtx, user: creatorUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(creatorCtx);

    await creatorCtx.db.batch([
      projectMemberRepository.insertStmt(creatorCtx.db, {
        projectId,
        userId: creatorUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const parentTask = await taskService.createTask(creatorCtx, projectId, {
      title: "Parent Task to Archive",
    });

    const childTask = await taskService.createTask(creatorCtx, projectId, {
      title: "Child Subtask to Archive",
      parentTaskId: parentTask.id,
    });

    await taskService.archiveTask(creatorCtx, projectId, parentTask.id, {
      version: 1,
    });

    // Parent should be soft deleted
    const foundParent = await taskRepository.findById(creatorCtx.db, parentTask.id);
    expect(foundParent).toBeUndefined();

    // Child should also be soft deleted
    const foundChild = await taskRepository.findById(creatorCtx.db, childTask.id);
    expect(foundChild).toBeUndefined();

    // Audit log TASK_ARCHIVED should be recorded
    const logs = await auditLogRepository.listByProject(creatorCtx.db, projectId);
    const archiveLog = logs.find((l) => l.action === "TASK_ARCHIVED" && l.entityId === parentTask.id);
    expect(archiveLog).toBeDefined();
    expect(archiveLog?.actorId).toBe(creatorUser.id);
  });

  it("FR-14 c1: project TEAM_LEAD / PM / ADMIN can archive task created by someone else", async () => {
    const { ctx: creatorCtx, user: creatorUser } = await createTestContext("MEMBER");
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { projectId } = await createProjectWithMembers(creatorCtx);

    await creatorCtx.db.batch([
      projectMemberRepository.insertStmt(creatorCtx.db, {
        projectId,
        userId: creatorUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(creatorCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(creatorCtx, projectId, {
      title: "Task to be archived by lead",
    });

    await taskService.archiveTask(leadCtx, projectId, task.id, {
      version: 1,
    });

    const found = await taskRepository.findById(leadCtx.db, task.id);
    expect(found).toBeUndefined();
  });

  it("FR-14 c2: member assignee who is not creator is forbidden from archiving (403)", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task assigned to member",
      assigneeIds: [memberUser.id],
    });

    await expect(
      taskService.archiveTask(memberCtx, projectId, task.id, {
        version: 1,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to archive this task",
    });
  });

  it("A20: rejects with 409 when version is stale", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task with stale version",
    });

    await expect(
      taskService.archiveTask(leadCtx, projectId, task.id, {
        version: 99,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "This task was changed by someone else. Reload to see the latest version.",
    });
  });

  it("rejects with 404 when non-member archives task", async () => {
    const { ctx: leadCtx, user: leadUser } = await createTestContext("TEAM_LEAD");
    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");
    const { projectId } = await createProjectWithMembers(leadCtx);

    await leadCtx.db.batch([
      projectMemberRepository.insertStmt(leadCtx.db, {
        projectId,
        userId: leadUser.id,
        projectRole: "TEAM_LEAD",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(leadCtx, projectId, {
      title: "Task for non-member test",
    });

    await expect(
      taskService.archiveTask(nonMemberCtx, projectId, task.id, {
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 403 when archiving task in archived project", async () => {
    const { ctx: adminCtx } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx);

    await adminCtx.db.batch([
      projectMemberRepository.insertStmt(adminCtx.db, {
        projectId,
        userId: adminCtx.user?.id ?? "",
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(adminCtx, projectId, {
      title: "Task in project to be archived",
    });

    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(
      taskService.archiveTask(adminCtx, projectId, task.id, {
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 403, message: "This project is archived" });
  });
});
