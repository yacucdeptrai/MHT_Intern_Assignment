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
import { adminStatusesAction } from "../../app/actions/adminStatusesAction";
import { adminStatusesLoader } from "../../app/loaders/adminStatusesLoader";
import { commitSession, getSession } from "../../app/utils/session.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

async function createAuthenticatedRequest(
  urlStr: string,
  role: "ADMIN" | "PM" | "MEMBER",
  formDataObj?: Record<string, string | string[]>,
): Promise<{ request: Request; ctx: RequestContext; userId: string }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${userId}@example.com`;

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request(urlStr), env.SESSION_SECRET);
  session.set("userId", userId);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

  const headers = new Headers();
  headers.set("Cookie", cookie);

  let body: FormData | undefined;
  let method = "GET";
  if (formDataObj) {
    method = "POST";
    body = new FormData();
    for (const [k, v] of Object.entries(formDataObj)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          body.append(k, item);
        }
      } else {
        body.append(k, v);
      }
    }
  }

  const request = new Request(urlStr, {
    method,
    headers,
    body,
  });

  const ctx: RequestContext = {
    env,
    db,
    user: null,
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

  return { request, ctx, userId };
}

describe("adminStatusesAction and Loader", () => {
  it("FR-20 c1: create intent creates status and returns 201", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "create",
      name: `Triage-${Date.now()}`,
      category: "TODO",
    });

    const res = await adminStatusesAction(ctx, request);
    expect(res.status).toBe(201);
    const json = await res.json<{ success: boolean; status: { id: string; name: string } }>();
    expect(json.success).toBe(true);
    expect(json.status.id).toBeDefined();
  });

  it("FR-20 c1: create intent with invalid data returns 400 with field errors", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "create",
      name: "",
      category: "INVALID",
    });

    const res = await adminStatusesAction(ctx, request);
    expect(res.status).toBe(400);
    const json = await res.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(json.success).toBe(false);
    expect(json.errors.name).toBeDefined();
  });

  it("FR-20 c2: update intent renames status and returns 200", async () => {
    const { ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const created = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `ToRename-${Date.now()}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { request: updateReq } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "update",
      statusId: created.id,
      name: `Renamed-${Date.now()}`,
    });

    const res = await adminStatusesAction(ctx, updateReq);
    expect(res.status).toBe(200);
    const json = await res.json<{ success: boolean; status: { name: string } }>();
    expect(json.success).toBe(true);
    expect(json.status.name).toMatch(/^Renamed-/);
  });

  it("FR-20 c2: reorder intent reorders statuses and returns 200", async () => {
    const { ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const s1 = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `Re1-${Date.now()}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const s2 = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `Re2-${Date.now()}`,
      category: "TODO",
      position: 2,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { request: reorderReq } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "reorder",
      orderedIds: [s2.id, s1.id],
    });

    const res = await adminStatusesAction(ctx, reorderReq);
    expect(res.status).toBe(200);
    const json = await res.json<{ success: boolean }>();
    expect(json.success).toBe(true);
  });

  it("FR-20 c2 / A25: setDefault intent sets default and returns 200", async () => {
    const { ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const status = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `ToDefault-${Date.now()}`,
      category: "DONE",
      position: 1,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { request: setDefaultReq } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "setDefault",
      statusId: status.id,
    });

    const res = await adminStatusesAction(ctx, setDefaultReq);
    expect(res.status).toBe(200);
    const json = await res.json<{ success: boolean; status: { isDefault: boolean } }>();
    expect(json.success).toBe(true);
    expect(json.status.isDefault).toBe(true);
  });

  it("FR-20 c3 / A26: delete intent deletes status and returns 200", async () => {
    const { ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const status = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `ToDeleteAction-${Date.now()}`,
      category: "TODO",
      position: 10,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { request: deleteReq } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "delete",
      statusId: status.id,
    });

    const res = await adminStatusesAction(ctx, deleteReq);
    expect(res.status).toBe(200);
    const json = await res.json<{ success: boolean }>();
    expect(json.success).toBe(true);
  });

  it("returns 400 on unknown intent", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN", {
      intent: "invalidIntent",
    });

    const res = await adminStatusesAction(ctx, request);
    expect(res.status).toBe(400);
  });

  it("FR-20 c5: rejects non-Admin with 403", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "PM", {
      intent: "create",
      name: "ShouldFail",
      category: "TODO",
    });

    const res = await adminStatusesAction(ctx, request);
    expect(res.status).toBe(403);
  });

  it("adminStatusesLoader returns statuses with taskCount", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const data = await adminStatusesLoader(ctx, request);
    expect(Array.isArray(data.statuses)).toBe(true);
    const first = data.statuses[0];
    if (first) {
      expect(typeof first.taskCount).toBe("number");
    }
  });

  it("FR-20 c3: adminStatusesLoader aggregates taskCount (a status with 2 tasks, one archived, shows 2; a status with none shows 0)", async () => {
    const { request, ctx, userId } = await createAuthenticatedRequest("https://example.com/admin/statuses", "ADMIN");
    const now = new Date();
    const projectId = crypto.randomUUID();
    const projectCode = `PRJ-${projectId.slice(0, 4).toUpperCase()}`;

    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: projectCode,
        name: "Test Project for Status Task Count",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId,
        projectRole: "PM",
        createdAt: now,
      }),
    ]);

    const statusWithTasks = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `StatusWithTasks-${crypto.randomUUID()}`,
      category: "TODO",
      position: 99,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const statusEmpty = await taskStatusRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      name: `StatusEmpty-${crypto.randomUUID()}`,
      category: "TODO",
      position: 100,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const activeTaskId = crypto.randomUUID();
    const archivedTaskId = crypto.randomUUID();

    // 2 tasks under statusWithTasks: 1 active, 1 archived
    await ctx.db.batch([
      taskRepository.insertStmt(ctx.db, {
        id: activeTaskId,
        projectId,
        statusId: statusWithTasks.id,
        title: "Active task",
        priority: "MEDIUM",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(ctx.db, {
        id: archivedTaskId,
        projectId,
        statusId: statusWithTasks.id,
        title: "Archived task",
        priority: "LOW",
        createdById: userId,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Archive the second task
    const allTasks = await taskRepository.listByProject(ctx.db, projectId);
    const archivedTask = allTasks.find((t) => t.id === archivedTaskId);
    if (archivedTask) {
      await taskRepository.archiveStmt(ctx.db, archivedTask.id, now);
    }

    const data = await adminStatusesLoader(ctx, request);
    const targetWithTasks = data.statuses.find((s) => s.id === statusWithTasks.id);
    const targetEmpty = data.statuses.find((s) => s.id === statusEmpty.id);

    expect(targetWithTasks?.taskCount).toBe(2);
    expect(targetEmpty?.taskCount).toBe(0);
  });

  it("adminStatusesLoader throws 403 for non-Admin", async () => {
    const { request, ctx } = await createAuthenticatedRequest("https://example.com/admin/statuses", "MEMBER");
    await expect(adminStatusesLoader(ctx, request)).rejects.toMatchObject({ status: 403 });
  });
});
