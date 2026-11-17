import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectMemberRepository, projectRepository, userRepository } from "@pm/db";
import { sprintsAction } from "../../app/actions/sprintsAction";
import { sprintsLoader } from "../../app/loaders/sprintsLoader";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
): Promise<{ ctx: RequestContext; cookie: string; user: { id: string; fullName: string; email: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${id}-${Date.now()}@example.com`;

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
    env: {
      ...env,
      SESSION_SECRET: secret,
      APP_BASE_URL: env.APP_BASE_URL || "http://localhost:3000",
    },
    db,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: user.status,
    },
    requestId: "test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, cookie, user };
}

async function createProject(db: ReturnType<typeof createDatabase>, creatorId: string) {
  const now = new Date();
  const projectId = crypto.randomUUID();
  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: `SP${crypto.randomUUID().slice(0, 6)}`.toUpperCase(),
      name: "Route Test Project",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: creatorId,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: creatorId,
      projectRole: "PM",
      createdAt: now,
    }),
  ]);
  return projectId;
}

describe("Sprints Route Loader & Action (FR-36)", () => {
  it("loader returns sprints and permissions for project lead", async () => {
    const { ctx, cookie, user } = await createTestContext("PM");
    const projectId = await createProject(ctx.db, user.id);

    const req = new Request(`http://localhost/projects/${projectId}/sprints`, {
      headers: { Cookie: cookie },
    });

    const data = await sprintsLoader(ctx, req, projectId);
    expect(data.project.id).toBe(projectId);
    expect(data.permissions.canManageSprint).toBe(true);
    expect(Array.isArray(data.sprints)).toBe(true);
  });

  it("action creates sprint when intent is create", async () => {
    const { ctx, cookie, user } = await createTestContext("PM");
    const projectId = await createProject(ctx.db, user.id);

    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", "Sprint 1 from Action");
    formData.append("startDate", "2026-11-01");
    formData.append("endDate", "2026-11-14");

    const req = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await sprintsAction(ctx, req, projectId);
    expect(res.status).toBe(200);
    const body = await res.json<{ success: boolean; sprint: { id: string; name: string } }>();
    expect(body.success).toBe(true);
    expect(body.sprint.name).toBe("Sprint 1 from Action");
  });

  it("action updates sprint when intent is update", async () => {
    const { ctx, cookie, user } = await createTestContext("PM");
    const projectId = await createProject(ctx.db, user.id);

    // Create sprint first
    const createData = new FormData();
    createData.append("intent", "create");
    createData.append("name", "Sprint to Update");
    createData.append("startDate", "2026-11-01");
    createData.append("endDate", "2026-11-14");

    const createReq = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: createData,
    });

    const createRes = await sprintsAction(ctx, createReq, projectId);
    const createBody = await createRes.json<{ success: boolean; sprint: { id: string } }>();
    const sprintId = createBody.sprint.id;

    // Update sprint
    const updateData = new FormData();
    updateData.append("intent", "update");
    updateData.append("sprintId", sprintId);
    updateData.append("name", "Updated Sprint Title");
    updateData.append("startDate", "2026-11-05");
    updateData.append("endDate", "2026-11-20");

    const updateReq = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: updateData,
    });

    const updateRes = await sprintsAction(ctx, updateReq, projectId);
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json<{ success: boolean; sprint: { name: string } }>();
    expect(updateBody.success).toBe(true);
    expect(updateBody.sprint.name).toBe("Updated Sprint Title");
  });

  it("action archives sprint when intent is archive", async () => {
    const { ctx, cookie, user } = await createTestContext("PM");
    const projectId = await createProject(ctx.db, user.id);

    // Create sprint
    const createData = new FormData();
    createData.append("intent", "create");
    createData.append("name", "Sprint to Archive");
    createData.append("startDate", "2026-11-01");
    createData.append("endDate", "2026-11-14");

    const createReq = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: createData,
    });

    const createRes = await sprintsAction(ctx, createReq, projectId);
    const createBody = await createRes.json<{ success: boolean; sprint: { id: string } }>();
    const sprintId = createBody.sprint.id;

    // Archive sprint
    const archiveData = new FormData();
    archiveData.append("intent", "archive");
    archiveData.append("sprintId", sprintId);

    const archiveReq = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: archiveData,
    });

    const archiveRes = await sprintsAction(ctx, archiveReq, projectId);
    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json<{ success: boolean; sprint: { id: string } }>();
    expect(archiveBody.success).toBe(true);
  });

  it("action returns 400 when intent is invalid", async () => {
    const { ctx, cookie, user } = await createTestContext("PM");
    const projectId = await createProject(ctx.db, user.id);

    const formData = new FormData();
    formData.append("intent", "invalidIntent");

    const req = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await sprintsAction(ctx, req, projectId);
    expect(res.status).toBe(400);
  });

  it("action returns 403 when MEMBER tries to create sprint", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const projectId = await createProject(pmCtx.db, pmUser.id);

    const { ctx: memberCtx, cookie: memberCookie, user: memberUser } = await createTestContext("MEMBER");
    await pmCtx.db.batch([
      projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", "Member Attempt");
    formData.append("startDate", "2026-11-01");
    formData.append("endDate", "2026-11-14");

    const req = new Request(`http://localhost/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { Cookie: memberCookie },
      body: formData,
    });

    const res = await sprintsAction(memberCtx, req, projectId);
    expect(res.status).toBe(403);
  });
});
