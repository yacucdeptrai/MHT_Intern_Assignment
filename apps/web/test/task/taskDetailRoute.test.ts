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
});
