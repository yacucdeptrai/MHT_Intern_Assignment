import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";

import { loader as reportsRouteLoader } from "../../app/routes/_app.projects.$projectId.reports";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function createTestUser(
  db: ReturnType<typeof createDatabase>,
  systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
  emailPrefix: string,
) {
  const now = new Date("2026-11-19T08:00:00+07:00");
  const id = crypto.randomUUID();
  const email = `${emailPrefix}-${id.slice(0, 8)}@example.com`;
  return userRepository.insert(db, {
    id,
    email,
    fullName: `${emailPrefix} User`,
    systemRole,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });
}

async function makeLoaderArgs(ctx: RequestContext, urlStr: string, user: { id: string }, projectId: string) {
  const secret = env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long";
  const session = await getSession(new Request("http://localhost"), secret);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret });

  const request = new Request(urlStr, {
    headers: { Cookie: cookie },
  });

  const contextMap = new Map<unknown, unknown>();
  contextMap.set(requestContextKey, ctx);

  return {
    request,
    params: { projectId },
    context: contextMap as unknown as { get: (k: unknown) => RequestContext },
  } as unknown as Parameters<typeof reportsRouteLoader>[0];
}

describe("Reports Route (_app.projects.$projectId.reports.tsx) (FR-30)", () => {
  it("FR-30 c2: project MEMBER receives 403 Forbidden", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T08:00:00+07:00");
    const pm = await createTestUser(db, "MEMBER", "pm");
    const member = await createTestUser(db, "MEMBER", "member");

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Test Project",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pm.id,
        projectRole: "PM",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: member.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
    ]);

    const ctx: RequestContext = {
      env,
      db,
      user: member,
      requestId: "test-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => now },
    };

    const args = await makeLoaderArgs(ctx, `http://localhost/projects/${projectId}/reports`, member, projectId);

    await expect(reportsRouteLoader(args)).rejects.toMatchObject({ status: 403 });
  });

  it("FR-30 c1: lead (TEAM_LEAD) receives 200 with aggregated member report data and sprints", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T08:00:00+07:00");
    const pm = await createTestUser(db, "MEMBER", "pm2");
    const lead = await createTestUser(db, "MEMBER", "lead2");
    const member = await createTestUser(db, "MEMBER", "dev2");

    const projectId = crypto.randomUUID();
    const sprintId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Test Project 2",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pm.id,
        projectRole: "PM",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: lead.id,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: member.id,
        projectRole: "MEMBER",
        createdAt: now,
      }),
      sprintRepository.insertStmt(db, {
        id: sprintId,
        projectId,
        name: "Sprint Alpha",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `To Do ${Date.now()}`,
        category: "TODO",
        position: 10,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `Done ${Date.now()}`,
        category: "DONE",
        position: 20,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const taskId = crypto.randomUUID();
    await db.batch([
      taskRepository.insertStmt(db, {
        id: taskId,
        projectId,
        sprintId,
        statusId: statusTodoId,
        title: "Dev Task 1",
        dueDate: "2026-11-10", // overdue relative to 2026-11-19
        createdById: pm.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [member.id], now),
    ]);

    const ctx: RequestContext = {
      env,
      db,
      user: lead,
      requestId: "test-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => now },
    };

    const args = await makeLoaderArgs(
      ctx,
      `http://localhost/projects/${projectId}/reports?sprintId=${sprintId}`,
      lead,
      projectId,
    );

    const data = await reportsRouteLoader(args);
    expect(data.tab).toBe("members");
    expect(data.sprints).toHaveLength(1);
    expect(data.sprints[0]?.name).toBe("Sprint Alpha");
    expect(data.memberReport).toBeDefined();

    const memberRow = data.memberReport?.find((r) => r.userId === member.id);
    expect(memberRow).toBeDefined();
    expect(memberRow?.totalAssigned).toBe(1);
    expect(memberRow?.todoCount).toBe(1);
    expect(memberRow?.overdueCount).toBe(1);
  });

  it("FR-30 c1 / FR-31 c4: TEAM_LEAD requesting ?tab=project receives 403 Forbidden", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T08:00:00+07:00");
    const pm = await createTestUser(db, "MEMBER", "pm3");
    const lead = await createTestUser(db, "MEMBER", "lead3");

    const projectId = crypto.randomUUID();
    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Test Project 3",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pm.id,
        projectRole: "PM",
        createdAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: lead.id,
        projectRole: "TEAM_LEAD",
        createdAt: now,
      }),
    ]);

    const ctx: RequestContext = {
      env,
      db,
      user: lead,
      requestId: "test-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => now },
    };

    const args = await makeLoaderArgs(
      ctx,
      `http://localhost/projects/${projectId}/reports?tab=project`,
      lead,
      projectId,
    );

    await expect(reportsRouteLoader(args)).rejects.toMatchObject({ status: 403 });
  });

  it("FR-31 c1: project PM receives 200 with projectReport data on ?tab=project", async () => {
    const db = createDatabase(env.DB);
    const now = new Date("2026-11-19T08:00:00+07:00");
    const pm = await createTestUser(db, "MEMBER", "pm4");

    const projectId = crypto.randomUUID();
    const statusTodoId = crypto.randomUUID();
    const statusDoneId = crypto.randomUUID();

    await db.batch([
      projectRepository.insertStmt(db, {
        id: projectId,
        code: `RPT${Date.now().toString().slice(-4)}`,
        name: "Test Project 4",
        startDate: "2026-11-01",
        endDate: "2026-12-31",
        status: "ACTIVE",
        createdById: pm.id,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(db, {
        projectId,
        userId: pm.id,
        projectRole: "PM",
        createdAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusTodoId,
        name: `To Do ${Date.now()}`,
        category: "TODO",
        position: 10,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
      taskStatusRepository.insertStmt(db, {
        id: statusDoneId,
        name: `Done ${Date.now()}`,
        category: "DONE",
        position: 20,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const ctx: RequestContext = {
      env,
      db,
      user: pm,
      requestId: "test-req",
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      waitUntil: () => {},
      clock: { now: () => now },
    };

    const args = await makeLoaderArgs(ctx, `http://localhost/projects/${projectId}/reports?tab=project`, pm, projectId);

    const data = await reportsRouteLoader(args);
    expect(data.tab).toBe("project");
    expect(data.projectReport).toBeDefined();
    expect(data.projectReport?.completionRate).toBe(0);
    expect(data.projectReport?.bottlenecks).toBeDefined();
    expect(data.projectReport?.sprintCompletion).toBeDefined();
  });
});
