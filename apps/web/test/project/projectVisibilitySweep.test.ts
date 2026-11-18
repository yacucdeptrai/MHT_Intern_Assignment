import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { NotFoundError } from "@pm/domain";

import { loader as projectLayoutLoader } from "../../app/routes/_app.projects.$projectId";
import { loader as projectMembersRouteLoader } from "../../app/routes/_app.projects.$projectId.members";
import { loader as projectReportsRouteLoader } from "../../app/routes/_app.projects.$projectId.reports";
import { loader as projectSprintsRouteLoader } from "../../app/routes/_app.projects.$projectId.sprints";
import {
  action as taskDetailRouteAction,
  loader as taskDetailRouteLoader,
} from "../../app/routes/_app.projects.$projectId.tasks.$taskId";
import { loader as attachmentDownloadLoader } from "../../app/routes/api.attachments.$attachmentId";
import { action as attachmentUploadAction } from "../../app/routes/api.attachments.upload";
import { loader as calendarRouteLoader } from "../../app/routes/_app.calendar";
import { projectService } from "../../app/services/project/project.service";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

type Actor = "admin" | "projectPm" | "projectLead" | "creator" | "assignee" | "otherMember" | "nonMember";
type Expected = "allow" | 403 | 404;

interface TestWorld {
  projectId: string;
  archivedProjectId: string;
  users: Record<Actor, { id: string; email: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" }>;
}

async function buildTestWorld(db: ReturnType<typeof createDatabase>): Promise<TestWorld> {
  const now = new Date();
  const makeUser = async (role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER", prefix: string) => {
    const id = crypto.randomUUID();
    const email = `${prefix}-${id}@example.com`;
    await userRepository.insert(db, {
      id,
      email,
      fullName: `${prefix} User`,
      systemRole: role,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    return { id, email, systemRole: role };
  };

  const admin = await makeUser("ADMIN", "admin");
  const projectPm = await makeUser("MEMBER", "project-pm");
  const projectLead = await makeUser("MEMBER", "project-lead");
  const creator = await makeUser("MEMBER", "creator");
  const assignee = await makeUser("MEMBER", "assignee");
  const otherMember = await makeUser("MEMBER", "other-member");
  const nonMember = await makeUser("MEMBER", "non-member");

  const projectId = crypto.randomUUID();
  const archivedProjectId = crypto.randomUUID();
  const actCode = `S${projectId.slice(0, 7).toUpperCase()}`;
  const arcCode = `A${archivedProjectId.slice(0, 7).toUpperCase()}`;

  // Active project with members
  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: actCode,
      name: "Sweep Active Project",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: creator.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: projectPm.id,
      projectRole: "PM",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: projectLead.id,
      projectRole: "TEAM_LEAD",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: creator.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: assignee.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: otherMember.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
  ]);

  // Archived project
  await db.batch([
    projectRepository.insertStmt(db, {
      id: archivedProjectId,
      code: arcCode,
      name: "Sweep Archived Project",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: projectPm.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId: archivedProjectId,
      userId: projectPm.id,
      projectRole: "PM",
      createdAt: now,
    }),
  ]);

  return {
    projectId,
    archivedProjectId,
    users: {
      admin,
      projectPm,
      projectLead,
      creator,
      assignee,
      otherMember,
      nonMember,
    },
  };
}

function contextFor(
  db: ReturnType<typeof createDatabase>,
  user: { id: string; email: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" },
): RequestContext {
  return {
    env,
    db,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.email,
      systemRole: user.systemRole,
      status: "ACTIVE",
    },
    requestId: "sweep-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };
}

async function requestFor(
  urlStr: string,
  user: { id: string; email: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" },
  ctx: RequestContext,
) {
  const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

  const headers = new Headers();
  headers.set("Cookie", cookie);

  const request = new Request(urlStr, { headers });
  const map = new Map<unknown, unknown>();
  map.set(requestContextKey, ctx);

  return {
    request,
    params: { projectId: urlStr.split("/").pop() ?? "" },
    context: {
      get: (k: unknown) => map.get(k),
    },
  } as unknown as Parameters<typeof projectLayoutLoader>[0];
}

describe("Service-Level Permission & Visibility Sweep (docs/09 §3.1)", () => {
  const viewCases: Array<[Actor, Expected]> = [
    ["admin", "allow"],
    ["projectPm", "allow"],
    ["projectLead", "allow"],
    ["creator", "allow"],
    ["assignee", "allow"],
    ["otherMember", "allow"],
    ["nonMember", 404],
  ];

  describe.each(viewCases)("getProjectHeader as %s", (actor, expected) => {
    it(`returns ${expected}`, async () => {
      const db = createDatabase(env.DB);
      const world = await buildTestWorld(db);
      const ctx = contextFor(db, world.users[actor]);

      const run = () => projectService.getProjectHeader(ctx, world.projectId);
      if (expected === "allow") {
        const result = await run();
        expect(result.project.id).toBe(world.projectId);
      } else {
        await expect(run()).rejects.toMatchObject({ status: expected });
      }
    });
  });

  it("FR-09 / P3: archived project returns 404 for non-admin member", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.projectPm);

    await expect(projectService.getProjectHeader(ctx, world.archivedProjectId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("FR-09 / P3: archived project returns read-only header for Admin", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.admin);

    const res = await projectService.getProjectHeader(ctx, world.archivedProjectId);
    expect(res.project.isArchived).toBe(true);
    expect(res.permissions).toEqual({
      canManageProject: false,
      canManageMembers: false,
      canManageSprint: false,
      canViewMemberReport: false,
      canViewProjectReport: false,
      canExportProject: false,
    });
  });

  it("P3: non-existent project returns 404 for anyone", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.admin);

    await expect(projectService.getProjectHeader(ctx, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("Route-Level 404 Sweep over Project Routes (docs/09 §3.1)", () => {
  it("throws 404 Response when non-member requests /projects/:projectId", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const args = await requestFor(`http://localhost/projects/${world.projectId}`, world.users.nonMember, ctx);

    try {
      await projectLayoutLoader(args);
      expect.fail("Should have thrown 404 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("throws 404 Response when non-member requests /projects/:projectId/members", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const args = await requestFor(`http://localhost/projects/${world.projectId}/members`, world.users.nonMember, ctx);

    try {
      await projectMembersRouteLoader(args);
      expect.fail("Should have thrown 404 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("throws 404 Response when non-member requests /projects/:projectId/sprints", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const args = await requestFor(`http://localhost/projects/${world.projectId}/sprints`, world.users.nonMember, ctx);

    try {
      await projectSprintsRouteLoader(args);
      expect.fail("Should have thrown 404 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 when non-member requests or posts to /projects/:projectId/tasks/:taskId", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const now = new Date();
    const status = await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `SweepStatus-${crypto.randomUUID().slice(0, 6)}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId: world.projectId,
        statusId: status.id,
        title: "Sweep Task",
        createdById: world.users.creator.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const ctx = contextFor(db, world.users.nonMember);
    const baseArgs = await requestFor(
      `http://localhost/projects/${world.projectId}/tasks/${taskId}`,
      world.users.nonMember,
      ctx,
    );
    const loaderArgs = {
      ...baseArgs,
      params: { projectId: world.projectId, taskId },
    } as unknown as Parameters<typeof taskDetailRouteLoader>[0];

    await expect(taskDetailRouteLoader(loaderArgs)).rejects.toMatchObject({ status: 404 });

    const form = new FormData();
    form.append("intent", "changeStatus");
    form.append("statusId", status.id);
    form.append("version", "1");
    const postReq = new Request(`http://localhost/projects/${world.projectId}/tasks/${taskId}`, {
      method: "POST",
      headers: baseArgs.request.headers,
      body: form,
    });
    const actionArgs = {
      ...baseArgs,
      request: postReq,
      params: { projectId: world.projectId, taskId },
    } as unknown as Parameters<typeof taskDetailRouteAction>[0];

    const res = await taskDetailRouteAction(actionArgs);
    expect(res.status).toBe(404);

    for (const extraEntries of [
      [
        ["intent", "comment"],
        ["body", "Non-member comment probe"],
      ],
      [
        ["intent", "deleteComment"],
        ["commentId", "comment-probe-id"],
      ],
      [
        ["intent", "deleteAttachment"],
        ["attachmentId", "att-probe-id"],
      ],
    ] as const) {
      const extraForm = new FormData();
      for (const [k, v] of extraEntries) {
        extraForm.append(k, v);
      }
      const extraRes = await taskDetailRouteAction({
        ...baseArgs,
        request: new Request(`http://localhost/projects/${world.projectId}/tasks/${taskId}`, {
          method: "POST",
          headers: baseArgs.request.headers,
          body: extraForm,
        }),
        params: { projectId: world.projectId, taskId },
      });
      expect(extraRes.status).toBe(404);
    }
  });

  it("throws 404 Response when non-existent project is requested", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.admin);
    const args = await requestFor("http://localhost/projects/non-existent-proj-id", world.users.admin, ctx);

    try {
      await projectLayoutLoader(args);
      expect.fail("Should have thrown 404 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("throws 404 Response when non-admin requests archived project", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.projectPm);
    const args = await requestFor(`http://localhost/projects/${world.archivedProjectId}`, world.users.projectPm, ctx);

    try {
      await projectLayoutLoader(args);
      expect.fail("Should have thrown 404 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const res = err as Response;
      expect(res.status).toBe(404);
    }
  });

  it("succeeds with 200 data when active member requests /projects/:projectId", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.projectLead);
    const args = await requestFor(`http://localhost/projects/${world.projectId}`, world.users.projectLead, ctx);

    const data = await projectLayoutLoader(args);
    expect(data.project.id).toBe(world.projectId);
    expect(data.permissions.canManageSprint).toBe(true);
    expect(data.permissions.canManageProject).toBe(false);
  });

  it("succeeds with 200 data when Admin requests /projects/:projectId", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.admin);
    const args = await requestFor(`http://localhost/projects/${world.projectId}`, world.users.admin, ctx);

    const data = await projectLayoutLoader(args);
    expect(data.project.id).toBe(world.projectId);
    expect(data.permissions.canManageProject).toBe(true);
  });

  it("succeeds with 200 data and read-only permissions when Admin requests archived project", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.admin);
    const args = await requestFor(`http://localhost/projects/${world.archivedProjectId}`, world.users.admin, ctx);

    const data = await projectLayoutLoader(args);
    expect(data.project.id).toBe(world.archivedProjectId);
    expect(data.project.isArchived).toBe(true);
    expect(data.permissions.canManageProject).toBe(false);
    expect(data.permissions.canManageMembers).toBe(false);
  });

  it("FR-18 c3: returns 404 Response when non-member posts to /api/attachments/upload", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const form = new FormData();
    form.append("projectId", world.projectId);
    form.append("taskId", "some-task-id");
    form.append("file", new File(["dummy content"], "test.pdf", { type: "application/pdf" }));

    const baseArgs = await requestFor("http://localhost/api/attachments/upload", world.users.nonMember, ctx);
    const postReq = new Request("http://localhost/api/attachments/upload", {
      method: "POST",
      headers: baseArgs.request.headers,
      body: form,
    });
    const args = { ...baseArgs, request: postReq } as unknown as Parameters<typeof attachmentUploadAction>[0];

    const res = await attachmentUploadAction(args);
    expect(res.status).toBe(404);
  });

  it("FR-18 c3: returns 404 Response when non-member requests /api/attachments/:attachmentId", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const baseArgs = await requestFor(
      `http://localhost/api/attachments/att-123?projectId=${world.projectId}`,
      world.users.nonMember,
      ctx,
    );
    const args = {
      ...baseArgs,
      params: { attachmentId: "att-123" },
    } as unknown as Parameters<typeof attachmentDownloadLoader>[0];

    const res = await attachmentDownloadLoader(args);
    expect(res.status).toBe(404);
  });

  it("FR-35 c2 / P3: returns 404 when non-member filters /calendar by project", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const args = await requestFor(`http://localhost/calendar?projectId=${world.projectId}`, world.users.nonMember, ctx);
    await expect(calendarRouteLoader(args)).rejects.toMatchObject({ status: 404 });
  });

  it("FR-30 c2 / P3: returns 404 Response when non-member requests /projects/:projectId/reports", async () => {
    const db = createDatabase(env.DB);
    const world = await buildTestWorld(db);
    const ctx = contextFor(db, world.users.nonMember);
    const args = await requestFor(`http://localhost/projects/${world.projectId}/reports`, world.users.nonMember, ctx);
    const loaderArgs = {
      ...args,
      params: { projectId: world.projectId },
    } as unknown as Parameters<typeof projectReportsRouteLoader>[0];
    await expect(projectReportsRouteLoader(loaderArgs)).rejects.toMatchObject({ status: 404 });
  });
});
