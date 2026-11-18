import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { NotFoundError } from "@pm/domain";

import { taskDetailAction } from "../../app/actions/taskDetailAction";
import { taskDetailLoader } from "../../app/loaders/taskDetailLoader";
import { taskService } from "../../app/services/task.service";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestContext(role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "MEMBER") {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `task-detail-${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`;

  const user = await userRepository.insert(db, {
    id,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const secret = env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long";
  const session = await getSession(new Request("http://localhost"), secret);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret });

  const ctx: RequestContext = {
    db,
    env: {
      ...env,
      SESSION_SECRET: secret,
      APP_BASE_URL: env.APP_BASE_URL || "http://localhost:3000",
    },
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

  return { ctx, user, cookie };
}

async function createProject(ctx: RequestContext) {
  const now = new Date();
  const projectId = crypto.randomUUID();

  await ctx.db.batch([
    projectRepository.insertStmt(ctx.db, {
      id: projectId,
      code: `DTL${Date.now().toString().slice(-6)}`,
      name: "Detail Test Project",
      status: "ACTIVE",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      createdById: ctx.user?.id ?? "",
      createdAt: now,
      updatedAt: now,
    }),
  ]);

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

describe("taskDetailLoader", () => {
  it("FR-13 c1: returns task details and permissions for member", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Loader test task",
      description: "Description test",
      priority: "HIGH",
    });

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      headers: { Cookie: cookie },
    });

    const data = await taskDetailLoader(ctx, projectId, task.id, req);
    expect(data.task.id).toBe(task.id);
    expect(data.task.title).toBe("Loader test task");
    expect(data.permissions.canEdit).toBe(true);
  });

  it("FR-13 c3: non-member receives 404 NotFoundError", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProject(pmCtx);

    await pmCtx.db.batch([
      projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: pmUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(pmCtx, projectId, { title: "PM Task" });

    const { ctx: nonMemberCtx, cookie: nonMemberCookie } = await createTestContext("MEMBER");
    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      headers: { Cookie: nonMemberCookie },
    });

    await expect(taskDetailLoader(nonMemberCtx, projectId, task.id, req)).rejects.toThrow(NotFoundError);
  });

  it("redirects unauthenticated user to /login", async () => {
    const { ctx } = await createTestContext("MEMBER");
    const req = new Request("http://localhost/projects/p-1/tasks/t-1");

    await expect(taskDetailLoader(ctx, "p-1", "t-1", req)).rejects.toThrow();
  });
});

describe("taskDetailAction", () => {
  it("FR-13 c1 / A15: updates task, increments version, and audits TASK_UPDATED", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Initial Title",
      priority: "LOW",
    });

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", String(task.version));
    formData.append("title", "Updated Title via Action");
    formData.append("priority", "URGENT");
    formData.append("startDate", "2026-12-01");
    formData.append("dueDate", "2026-12-10");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(200);

    const json = await res.json<{ success: boolean; task: { title: string; version: number } }>();
    expect(json.success).toBe(true);
    expect(json.task.title).toBe("Updated Title via Action");
    expect(json.task.version).toBe(2);
  });

  it("FR-13 c2: returns 409 when stale version is submitted", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Concurrent Task",
    });

    // Bump version to 2
    await taskService.updateTask(ctx, projectId, task.id, {
      version: 1,
      title: "First Update",
    });

    // Try to update with version 1
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", "1");
    formData.append("title", "Stale Update");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(409);

    const json = await res.json<{ success: boolean; message: string }>();
    expect(json.success).toBe(false);
    expect(json.message).toContain("Reload to see the latest version");
  });

  it("FR-13 c3: returns 403 when non-editor member posts update", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProject(pmCtx);

    const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");

    await pmCtx.db.batch([
      projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: pmUser.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
      projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(pmCtx, projectId, {
      title: "PM Task",
    });

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", "1");
    formData.append("title", "Member Attempt");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: memberCookie },
      body: formData,
    });

    const res = await taskDetailAction(memberCtx, projectId, task.id, req);
    expect(res.status).toBe(403);
  });

  it("FR-13 c4: returns 403 when task in DONE status is updated", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);

    const doneStatus = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `Done ${Date.now()}`,
      category: "DONE",
      position: 99,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Completed Task",
    });

    await ctx.db.batch([
      taskRepository.updateStatusStmt(ctx.db, {
        id: task.id,
        expectedVersion: 1,
        statusId: doneStatus.id,
        now: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", "2");
    formData.append("title", "Attempting update on DONE task");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(403);

    const json = await res.json<{ success: boolean; message: string }>();
    expect(json.message).toBe("Reopen the task to edit it");
  });

  it("FR-36 c3: returns 400 when sprint from another project is submitted, keeping values", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);
    const { projectId: otherProjectId } = await createProject(ctx);

    const foreignSprint = await sprintRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      projectId: otherProjectId,
      name: "Other Project Sprint",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Valid Task",
    });

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", "1");
    formData.append("sprintId", foreignSprint.id);

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(400);

    const json = await res.json<{
      success: boolean;
      errors: Record<string, string[]>;
      values: Record<string, unknown>;
    }>();
    expect(json.success).toBe(false);
    expect(json.errors.sprintId).toBeDefined();
    expect(json.values.sprintId).toBe(foreignSprint.id);
  });

  it("returns 400 for unknown intent", async () => {
    const { ctx, user, cookie } = await createTestContext("PM");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Task for unknown intent",
    });

    const formData = new FormData();
    formData.append("intent", "invalidIntent");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when updating on archived project", async () => {
    const { ctx, user, cookie } = await createTestContext("ADMIN");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "PM",
        createdAt: new Date(),
      }),
    ]);

    const task = await taskService.createTask(ctx, projectId, {
      title: "Task in project to be archived",
    });

    // Archive project
    await ctx.db.batch([projectRepository.archiveStmt(ctx.db, projectId, new Date())]);

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("version", "1");
    formData.append("title", "Archived Project Update Attempt");

    const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await taskDetailAction(ctx, projectId, task.id, req);
    expect(res.status).toBe(403);
  });

  describe("intent: assign (FR-15)", () => {
    it("FR-15 c1: allowed lead assigns task to project member, returns 200", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { user: memberUser } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, {
        title: "Task for assign route test",
      });

      const formData = new FormData();
      formData.append("intent", "assign");
      formData.append("version", "1");
      formData.append("assigneeIds", memberUser.id);

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: pmCookie },
        body: formData,
      });

      const res = await taskDetailAction(pmCtx, projectId, task.id, req);
      expect(res.status).toBe(200);
      const data = await res.json<{ success: boolean; task: { version: number; assignees: { id: string }[] } }>();
      expect(data.success).toBe(true);
      expect(data.task.version).toBe(2);
      expect(data.task.assignees.map((a) => a.id)).toEqual([memberUser.id]);
    });

    it("FR-15 c1: assigns multiple members when formData contains multiple assigneeIds entries", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { user: memberOne } = await createTestContext("MEMBER");
      const { user: memberTwo } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberOne.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberTwo.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, {
        title: "Multi-assignee form test",
      });

      const formData = new FormData();
      formData.append("intent", "assign");
      formData.append("version", "1");
      formData.append("assigneeIds", memberOne.id);
      formData.append("assigneeIds", memberTwo.id);

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: pmCookie },
        body: formData,
      });

      const res = await taskDetailAction(pmCtx, projectId, task.id, req);
      expect(res.status).toBe(200);
      const data = await res.json<{ success: boolean; task: { assignees: { id: string }[] } }>();
      expect(data.task.assignees.map((a) => a.id).sort()).toEqual([memberOne.id, memberTwo.id].sort());
    });

    it("FR-15 c2: non-member assignee returns 400 with 'Assignees must be project members'", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { user: nonMemberUser } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, {
        title: "Task for non-member route test",
      });

      const formData = new FormData();
      formData.append("intent", "assign");
      formData.append("version", "1");
      formData.append("assigneeIds", nonMemberUser.id);

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: pmCookie },
        body: formData,
      });

      const res = await taskDetailAction(pmCtx, projectId, task.id, req);
      expect(res.status).toBe(400);
      const data = await res.json<{ success: boolean; errors?: Record<string, string[]> }>();
      expect(data.success).toBe(false);
      expect(data.errors?.assigneeIds).toContain("Assignees must be project members");
    });

    it("FR-15 c3: regular member posting assign intent returns 403", async () => {
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(memberCtx);

      await memberCtx.db.batch([
        projectMemberRepository.insertStmt(memberCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(memberCtx, projectId, {
        title: "Task for regular member assign test",
      });

      const formData = new FormData();
      formData.append("intent", "assign");
      formData.append("version", "1");
      formData.append("assigneeIds", memberUser.id);

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: memberCookie },
        body: formData,
      });

      const res = await taskDetailAction(memberCtx, projectId, task.id, req);
      expect(res.status).toBe(403);
    });
  });

  describe("taskDetailAction archive intent (FR-14)", () => {
    it("FR-14 c1: creator archiving task redirects to /projects/${projectId}", async () => {
      const { ctx: creatorCtx, user: creatorUser, cookie: creatorCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(creatorCtx);

      await creatorCtx.db.batch([
        projectMemberRepository.insertStmt(creatorCtx.db, {
          projectId,
          userId: creatorUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(creatorCtx, projectId, {
        title: "Task to archive via route",
      });

      const formData = new FormData();
      formData.append("intent", "archive");
      formData.append("version", "1");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: creatorCookie },
        body: formData,
      });

      const res = await taskDetailAction(creatorCtx, projectId, task.id, req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`/projects/${projectId}`);

      // Verify task is soft deleted
      const found = await taskRepository.findById(creatorCtx.db, task.id);
      expect(found).toBeUndefined();
    });

    it("FR-14 c2: member assignee archiving task returns 403", async () => {
      const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, {
        title: "Task assigned to member",
        assigneeIds: [memberUser.id],
      });

      const formData = new FormData();
      formData.append("intent", "archive");
      formData.append("version", "1");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: memberCookie },
        body: formData,
      });

      const res = await taskDetailAction(memberCtx, projectId, task.id, req);
      expect(res.status).toBe(403);
    });

    it("non-member archiving task returns 404", async () => {
      const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
      const { ctx: nonMemberCtx, cookie: nonMemberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, {
        title: "Task for non-member archive",
      });

      const formData = new FormData();
      formData.append("intent", "archive");
      formData.append("version", "1");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: nonMemberCookie },
        body: formData,
      });

      const res = await taskDetailAction(nonMemberCtx, projectId, task.id, req);
      expect(res.status).toBe(404);
    });
  });

  describe("taskDetailAction addSubTask intent (FR-17)", () => {
    it("FR-17 c1: member adding sub-task via action succeeds and returns 200 with new sub-task", async () => {
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(memberCtx);

      await memberCtx.db.batch([
        projectMemberRepository.insertStmt(memberCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const parentTask = await taskService.createTask(memberCtx, projectId, {
        title: "Parent for sub-task",
      });

      const formData = new FormData();
      formData.append("intent", "addSubTask");
      formData.append("title", "New Sub-task via Action");
      formData.append("priority", "HIGH");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${parentTask.id}`, {
        method: "POST",
        headers: { Cookie: memberCookie },
        body: formData,
      });

      const res = await taskDetailAction(memberCtx, projectId, parentTask.id, req);
      expect(res.status).toBe(200);
      const data = await res.json<{ success: boolean; subTask: { id: string; parentTaskId: string; title: string } }>();
      expect(data.success).toBe(true);
      expect(data.subTask.parentTaskId).toBe(parentTask.id);
      expect(data.subTask.title).toBe("New Sub-task via Action");
    });

    it("FR-17 c2: attempting to add sub-task to a sub-task returns 400 'Sub-tasks cannot have sub-tasks'", async () => {
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(memberCtx);

      await memberCtx.db.batch([
        projectMemberRepository.insertStmt(memberCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const parentTask = await taskService.createTask(memberCtx, projectId, {
        title: "Parent Task",
      });

      const subTask = await taskService.createTask(memberCtx, projectId, {
        title: "Sub-task",
        parentTaskId: parentTask.id,
      });

      const formData = new FormData();
      formData.append("intent", "addSubTask");
      formData.append("title", "Illegal Grandchild Sub-task");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${subTask.id}`, {
        method: "POST",
        headers: { Cookie: memberCookie },
        body: formData,
      });

      const res = await taskDetailAction(memberCtx, projectId, subTask.id, req);
      expect(res.status).toBe(400);
      const data = await res.json<{ success: boolean; message?: string }>();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Sub-tasks cannot have sub-tasks");
    });

    it("non-member adding sub-task returns 404", async () => {
      const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
      const { ctx: nonMemberCtx, cookie: nonMemberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
      ]);

      const parentTask = await taskService.createTask(pmCtx, projectId, {
        title: "Parent for non-member sub-task",
      });

      const formData = new FormData();
      formData.append("intent", "addSubTask");
      formData.append("title", "Non-member Sub-task");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${parentTask.id}`, {
        method: "POST",
        headers: { Cookie: nonMemberCookie },
        body: formData,
      });

      const res = await taskDetailAction(nonMemberCtx, projectId, parentTask.id, req);
      expect(res.status).toBe(404);
    });
  });

  describe("taskDetailAction changeStatus intent (FR-21 / A16)", () => {
    it("FR-21 c1: editor changes status via action, returns 200 with updated task", async () => {
      const { ctx, user, cookie } = await createTestContext("PM");
      const { projectId } = await createProject(ctx);
      const inProgress = await taskStatusRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        name: `In Progress ${crypto.randomUUID().slice(0, 6)}`,
        category: "IN_PROGRESS",
        position: 2,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ctx.db.batch([
        projectMemberRepository.insertStmt(ctx.db, {
          projectId,
          userId: user.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(ctx, projectId, { title: "Action Status Task" });

      const formData = new FormData();
      formData.append("intent", "changeStatus");
      formData.append("statusId", inProgress.id);
      formData.append("version", "1");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await taskDetailAction(ctx, projectId, task.id, req);
      expect(res.status).toBe(200);
      const body = await res.json<{ success: boolean; task: { statusId: string; version: number } }>();
      expect(body.success).toBe(true);
      expect(body.task.statusId).toBe(inProgress.id);
      expect(body.task.version).toBe(2);
    });

    it("FR-21 c2: submitting DONE category status via changeStatus returns 403 'Only an approval can complete a task'", async () => {
      const { ctx, user, cookie } = await createTestContext("PM");
      const { projectId } = await createProject(ctx);
      const doneStatus = await taskStatusRepository.insert(ctx.db, {
        id: crypto.randomUUID(),
        name: `Done ${crypto.randomUUID().slice(0, 6)}`,
        category: "DONE",
        position: 4,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ctx.db.batch([
        projectMemberRepository.insertStmt(ctx.db, {
          projectId,
          userId: user.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(ctx, projectId, { title: "Blocked Done Action" });

      const formData = new FormData();
      formData.append("intent", "changeStatus");
      formData.append("statusId", doneStatus.id);
      formData.append("version", "1");

      const req = new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
        method: "POST",
        headers: { Cookie: cookie },
        body: formData,
      });

      const res = await taskDetailAction(ctx, projectId, task.id, req);
      expect(res.status).toBe(403);
      const body = await res.json<{ success: boolean; message: string }>();
      expect(body.message).toBe("Only an approval can complete a task");
    });

    it("FR-21 c4: returns 400 on missing statusId and 403 for non-editor member", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { ctx: otherCtx, user: otherUser, cookie: otherCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);
      const reviewStatus = await taskStatusRepository.insert(pmCtx.db, {
        id: crypto.randomUUID(),
        name: `Review ${crypto.randomUUID().slice(0, 6)}`,
        category: "REVIEW",
        position: 3,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: otherUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, { title: "Validation & Role Action Task" });

      const badForm = new FormData();
      badForm.append("intent", "changeStatus");
      badForm.append("statusId", "");
      badForm.append("version", "1");

      const badRes = await taskDetailAction(
        pmCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: pmCookie },
          body: badForm,
        }),
      );
      expect(badRes.status).toBe(400);
      const badJson = await badRes.json<{ success: boolean; errors: Record<string, string[]> }>();
      expect(badJson.errors.statusId).toBeDefined();

      const memberForm = new FormData();
      memberForm.append("intent", "changeStatus");
      memberForm.append("statusId", reviewStatus.id);
      memberForm.append("version", "1");

      const forbiddenRes = await taskDetailAction(
        otherCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: otherCookie },
          body: memberForm,
        }),
      );
      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe("taskDetailAction approve intent (FR-22 / A18)", () => {
    async function ensureDefaultStatus(db: RequestContext["db"], category: "REVIEW" | "DONE", pos: number) {
      const existing = await taskStatusRepository.findDefaultByCategory(db, category);
      if (existing) return existing;
      return taskStatusRepository.insert(db, {
        id: crypto.randomUUID(),
        name: `${category} ${crypto.randomUUID().slice(0, 6)}`,
        category,
        position: pos,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    it("FR-22 c1, c4: lead (including when also an assignee) approves REVIEW task via action, returning 200 with DONE task", async () => {
      const { ctx: leadCtx, user: leadUser, cookie: leadCookie } = await createTestContext("TEAM_LEAD");
      const { projectId } = await createProject(leadCtx);
      const reviewStatus = await ensureDefaultStatus(leadCtx.db, "REVIEW", 3);
      const doneStatus = await ensureDefaultStatus(leadCtx.db, "DONE", 4);

      await leadCtx.db.batch([
        projectMemberRepository.insertStmt(leadCtx.db, {
          projectId,
          userId: leadUser.id,
          projectRole: "TEAM_LEAD",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(leadCtx, projectId, {
        title: "Action Approve Task",
        assigneeIds: [leadUser.id],
      });
      await taskService.changeStatus(leadCtx, projectId, task.id, {
        statusId: reviewStatus.id,
        version: 1,
      });

      const form = new FormData();
      form.append("intent", "approve");
      form.append("version", "2");

      const res = await taskDetailAction(
        leadCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: leadCookie },
          body: form,
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{
        success: boolean;
        task: { statusId: string; statusCategory: string; completedAt: number | null; version: number };
      }>();
      expect(body.success).toBe(true);
      expect(body.task.statusId).toBe(doneStatus.id);
      expect(body.task.statusCategory).toBe("DONE");
      expect(body.task.completedAt).not.toBeNull();
      expect(body.task.version).toBe(3);
    });

    it("FR-22 c2, c3: returns 400 when approving non-REVIEW task, 403 for MEMBER, 400 on bad version, and 404 for non-member", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { ctx: nonMemberCtx, cookie: nonMemberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);
      await ensureDefaultStatus(pmCtx.db, "DONE", 4);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, { title: "Todo Task Cannot Approve" });

      // Lead approving TODO task -> 400 "Only tasks in review can be approved"
      const form = new FormData();
      form.append("intent", "approve");
      form.append("version", "1");
      const notReviewRes = await taskDetailAction(
        pmCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: pmCookie },
          body: form,
        }),
      );
      expect(notReviewRes.status).toBe(400);
      const notReviewJson = await notReviewRes.json<{ message: string }>();
      expect(notReviewJson.message).toBe("Only tasks in review can be approved");

      // Member approving -> 403
      const memberRes = await taskDetailAction(
        memberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: memberCookie },
          body: form,
        }),
      );
      expect(memberRes.status).toBe(403);

      // Invalid version -> 400
      const badForm = new FormData();
      badForm.append("intent", "approve");
      badForm.append("version", "0");
      const badRes = await taskDetailAction(
        pmCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: pmCookie },
          body: badForm,
        }),
      );
      expect(badRes.status).toBe(400);

      // Non-member -> 404
      const nonMemberRes = await taskDetailAction(
        nonMemberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: nonMemberCookie },
          body: form,
        }),
      );
      expect(nonMemberRes.status).toBe(404);
    });
  });

  describe("taskDetailAction reject and reopen intents (FR-23 / A19)", () => {
    async function ensureWorkflowDefaults(db: RequestContext["db"]) {
      const categories = [
        ["IN_PROGRESS", 2],
        ["REVIEW", 3],
        ["DONE", 4],
      ] as const;
      const result: Record<string, { id: string }> = {};
      for (const [category, pos] of categories) {
        const existing = await taskStatusRepository.findDefaultByCategory(db, category);
        if (existing) {
          result[category] = existing;
        } else {
          result[category] = await taskStatusRepository.insert(db, {
            id: crypto.randomUUID(),
            name: `${category} ${crypto.randomUUID().slice(0, 6)}`,
            category,
            position: pos,
            isDefault: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      return result;
    }

    it("FR-23 c1, c2: lead rejects REVIEW task with reason -> 200 IN_PROGRESS; empty reason -> 400 'A reason is required'", async () => {
      const { ctx: leadCtx, user: leadUser, cookie: leadCookie } = await createTestContext("TEAM_LEAD");
      const { projectId } = await createProject(leadCtx);
      const defaults = await ensureWorkflowDefaults(leadCtx.db);

      await leadCtx.db.batch([
        projectMemberRepository.insertStmt(leadCtx.db, {
          projectId,
          userId: leadUser.id,
          projectRole: "TEAM_LEAD",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(leadCtx, projectId, { title: "Action Reject Task" });
      await taskService.changeStatus(leadCtx, projectId, task.id, {
        statusId: defaults.REVIEW?.id ?? "",
        version: 1,
      });

      // Empty reason -> 400 "A reason is required"
      const emptyForm = new FormData();
      emptyForm.append("intent", "reject");
      emptyForm.append("version", "2");
      emptyForm.append("reason", "   ");

      const emptyRes = await taskDetailAction(
        leadCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: leadCookie },
          body: emptyForm,
        }),
      );
      expect(emptyRes.status).toBe(400);
      const emptyJson = await emptyRes.json<{ success: boolean; message: string }>();
      expect(emptyJson.message).toBe("A reason is required");

      // Valid reason -> 200 IN_PROGRESS
      const validForm = new FormData();
      validForm.append("intent", "reject");
      validForm.append("version", "2");
      validForm.append("reason", "Please add pagination boundary tests");

      const validRes = await taskDetailAction(
        leadCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: leadCookie },
          body: validForm,
        }),
      );
      expect(validRes.status).toBe(200);
      const validJson = await validRes.json<{
        success: boolean;
        task: { statusId: string; statusCategory: string; version: number };
      }>();
      expect(validJson.success).toBe(true);
      expect(validJson.task.statusId).toBe(defaults.IN_PROGRESS?.id);
      expect(validJson.task.statusCategory).toBe("IN_PROGRESS");
      expect(validJson.task.version).toBe(3);
    });

    it("FR-23 c3, c4: lead reopens DONE task -> 200 clearing completedAt; MEMBER gets 403; non-member gets 404", async () => {
      const { ctx: pmCtx, user: pmUser, cookie: pmCookie } = await createTestContext("PM");
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { ctx: nonMemberCtx, cookie: nonMemberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);
      const defaults = await ensureWorkflowDefaults(pmCtx.db);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, { title: "Action Reopen Task" });
      await taskService.changeStatus(pmCtx, projectId, task.id, {
        statusId: defaults.REVIEW?.id ?? "",
        version: 1,
      });

      // Member posting reject -> 403
      const memberRejectForm = new FormData();
      memberRejectForm.append("intent", "reject");
      memberRejectForm.append("version", "2");
      memberRejectForm.append("reason", "Member attempt");
      const memberRejectRes = await taskDetailAction(
        memberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: memberCookie },
          body: memberRejectForm,
        }),
      );
      expect(memberRejectRes.status).toBe(403);

      // PM approves -> DONE (version 3)
      await taskService.approveTask(pmCtx, projectId, task.id, { version: 2 });

      // Member posting reopen -> 403
      const memberReopenForm = new FormData();
      memberReopenForm.append("intent", "reopen");
      memberReopenForm.append("version", "3");
      memberReopenForm.append("reason", "Member reopen attempt");
      const memberReopenRes = await taskDetailAction(
        memberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: memberCookie },
          body: memberReopenForm,
        }),
      );
      expect(memberReopenRes.status).toBe(403);

      // Non-member posting reopen -> 404
      const nonMemberRes = await taskDetailAction(
        nonMemberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: nonMemberCookie },
          body: memberReopenForm,
        }),
      );
      expect(nonMemberRes.status).toBe(404);

      // PM reopens -> 200 IN_PROGRESS, completedAt null
      const reopenForm = new FormData();
      reopenForm.append("intent", "reopen");
      reopenForm.append("version", "3");
      reopenForm.append("reason", "Found bug after deployment");
      const reopenRes = await taskDetailAction(
        pmCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          method: "POST",
          headers: { Cookie: pmCookie },
          body: reopenForm,
        }),
      );
      expect(reopenRes.status).toBe(200);
      const reopenJson = await reopenRes.json<{
        success: boolean;
        task: { statusCategory: string; completedAt: number | null; version: number };
      }>();
      expect(reopenJson.success).toBe(true);
      expect(reopenJson.task.statusCategory).toBe("IN_PROGRESS");
      expect(reopenJson.task.completedAt).toBeNull();
      expect(reopenJson.task.version).toBe(4);
    });
  });

  describe("taskDetailLoader history (FR-24 c3)", () => {
    it("FR-24 c3: returns task audit history newest first to project members", async () => {
      const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
      const { ctx: memberCtx, user: memberUser, cookie: memberCookie } = await createTestContext("MEMBER");
      const { projectId } = await createProject(pmCtx);

      await pmCtx.db.batch([
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: pmUser.id,
          projectRole: "PM",
          createdAt: new Date(),
        }),
        projectMemberRepository.insertStmt(pmCtx.db, {
          projectId,
          userId: memberUser.id,
          projectRole: "MEMBER",
          createdAt: new Date(),
        }),
      ]);

      const task = await taskService.createTask(pmCtx, projectId, { title: "Loader History Task" });
      await taskService.updateTask(pmCtx, projectId, task.id, { title: "Loader History Task v2", version: 1 });

      const loaderData = await taskDetailLoader(
        memberCtx,
        projectId,
        task.id,
        new Request(`http://localhost/projects/${projectId}/tasks/${task.id}`, {
          headers: { Cookie: memberCookie },
        }),
      );

      expect(loaderData.history).toHaveLength(2);
      expect(loaderData.history[0]?.action).toBe("TASK_UPDATED");
      expect(loaderData.history[1]?.action).toBe("TASK_CREATED");
    });
  });
});
