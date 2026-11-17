import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { NotFoundError } from "@pm/domain";

import { projectTasksAction } from "../../app/actions/projectTasksAction";
import { projectTasksLoader } from "../../app/loaders/projectTasksLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";

import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestContext(role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" = "MEMBER") {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `task-action-${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`;

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
      code: `TKA${Date.now().toString().slice(-6)}`,
      name: "Action Testing Project",
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

  return { projectId, status };
}

describe("projectTasksAction & loader", () => {
  it("FR-12 c1: action creates task and returns 201 on valid intent", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "createTask");
    formData.append("title", "Action Created Task");
    formData.append("priority", "HIGH");

    const req = new Request("http://localhost/projects/" + projectId, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectTasksAction(ctx, projectId, req);
    expect(res.status).toBe(201);
    const body = await res.json<{
      success: boolean;
      task: { id: string; title: string; number: number };
    }>();
    expect(body.success).toBe(true);
    expect(body.task.title).toBe("Action Created Task");
    expect(body.task.number).toBe(1);
  });

  it("FR-12 c2: returns 400 on validation error", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "createTask");
    formData.append("title", "Invalid Dates");
    formData.append("startDate", "2026-12-10");
    formData.append("dueDate", "2026-12-05");

    const req = new Request("http://localhost/projects/" + projectId, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectTasksAction(ctx, projectId, req);
    expect(res.status).toBe(400);
    const body = await res.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body.success).toBe(false);
    expect(body.errors.dueDate).toBeDefined();
  });

  it("returns 400 on unknown intent", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "unknown");

    const req = new Request("http://localhost/projects/" + projectId, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectTasksAction(ctx, projectId, req);
    expect(res.status).toBe(400);
  });

  it("FR-12 c3: non-member receives 404", async () => {
    const { ctx, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    const formData = new FormData();
    formData.append("intent", "createTask");
    formData.append("title", "Non member task");

    const req = new Request("http://localhost/projects/" + projectId, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectTasksAction(ctx, projectId, req);
    expect(res.status).toBe(404);
  });

  it("P8: regular member passing assignees receives 403", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { user: otherUser } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "createTask");
    formData.append("title", "Member Assigning Task");
    formData.append("assigneeIds", otherUser.id);

    const req = new Request("http://localhost/projects/" + projectId, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectTasksAction(ctx, projectId, req);
    expect(res.status).toBe(403);
  });

  it("projectTasksLoader returns tasks, members, statuses for project member", async () => {
    const { ctx, user, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    await ctx.db.batch([
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: user.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const req = new Request("http://localhost/projects/" + projectId, {
      headers: { Cookie: cookie },
    });
    const data = await projectTasksLoader(ctx, projectId, req);

    expect(data.tasks).toBeDefined();
    expect(data.members.length).toBe(1);
    expect(data.statuses.length).toBeGreaterThanOrEqual(1);
    expect(data.canCreate).toBe(true);
    expect(data.canAssign).toBe(false);
  });

  it("projectTasksLoader throws 404 for non-member", async () => {
    const { ctx, cookie } = await createTestContext("MEMBER");
    const { projectId } = await createProject(ctx);

    const req = new Request("http://localhost/projects/" + projectId, {
      headers: { Cookie: cookie },
    });
    await expect(projectTasksLoader(ctx, projectId, req)).rejects.toThrow(NotFoundError);
  });
});
