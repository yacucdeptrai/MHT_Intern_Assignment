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
import { EXPORT_COLUMNS, type ExportRowsResponse } from "@pm/domain";

import { loader as exportRouteLoader } from "../../app/routes/api.projects.$projectId.export";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

async function setupRouteTestWorld(db: ReturnType<typeof createDatabase>) {
  const now = new Date("2026-11-19T08:00:00Z");

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
  const pm = await makeUser("MEMBER", "pm");
  const member = await makeUser("MEMBER", "member");
  const nonMember = await makeUser("MEMBER", "nonmember");

  const projectId = crypto.randomUUID();
  const projectCode = `R${projectId.slice(0, 4).toUpperCase()}`;

  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: projectCode,
      name: "Route Test Project",
      startDate: "2026-01-01",
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

  const defaultStatuses = await taskStatusRepository.list(db);
  const statusTodo =
    defaultStatuses.find((s) => s.category === "TODO") ??
    (await taskStatusRepository.insert(db, {
      id: crypto.randomUUID(),
      name: `To Do ${crypto.randomUUID().slice(0, 4)}`,
      category: "TODO",
      position: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }));

  await db.batch([
    taskRepository.insertStmt(db, {
      id: crypto.randomUUID(),
      projectId,
      statusId: statusTodo.id,
      title: "First Task",
      priority: "MEDIUM",
      createdById: pm.id,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return { projectId, projectCode, admin, pm, member, nonMember };
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
    requestId: "route-test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date("2026-11-19T08:00:00Z") },
  };
}

async function requestFor(
  urlStr: string,
  user: { id: string; email: string; systemRole: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER" },
  ctx: RequestContext,
  projectId: string,
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
    params: { projectId },
    context: {
      get: (k: unknown) => map.get(k),
    },
  } as unknown as Parameters<typeof exportRouteLoader>[0];
}

describe("GET /api/projects/:projectId/export (FR-32)", () => {
  it("FR-32 c1: returns 200 with CSV attachment and download headers", async () => {
    const db = createDatabase(env.DB);
    const world = await setupRouteTestWorld(db);
    const ctx = contextFor(db, world.pm);

    const args = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=csv`,
      world.pm,
      ctx,
      world.projectId,
    );

    const res = await exportRouteLoader(args);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain(`filename="${world.projectCode}-tasks.csv"`);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("First Task");
  });

  it("FR-32 c1: returns 200 with JSON { columns, rows, fileName } for format=rows", async () => {
    const db = createDatabase(env.DB);
    const world = await setupRouteTestWorld(db);
    const ctx = contextFor(db, world.pm);

    const args = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=rows`,
      world.pm,
      ctx,
      world.projectId,
    );

    const res = await exportRouteLoader(args);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const json = await res.json<ExportRowsResponse>();
    expect(json.columns).toEqual([...EXPORT_COLUMNS]);
    expect(json.fileName).toBe(`${world.projectCode}-tasks.xlsx`);
    expect(json.rows.length).toBe(1);
    expect(json.rows[0]?.[1]).toBe("First Task");
  });

  it("returns 400 when format query param is missing or invalid", async () => {
    const db = createDatabase(env.DB);
    const world = await setupRouteTestWorld(db);
    const ctx = contextFor(db, world.pm);

    const noFormatArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export`,
      world.pm,
      ctx,
      world.projectId,
    );
    const resNoFormat = await exportRouteLoader(noFormatArgs);
    expect(resNoFormat.status).toBe(400);

    const badFormatArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=xlsx`,
      world.pm,
      ctx,
      world.projectId,
    );
    const resBadFormat = await exportRouteLoader(badFormatArgs);
    expect(resBadFormat.status).toBe(400);
  });

  it("FR-32 c3: returns 403 Forbidden when project MEMBER requests export in csv or rows", async () => {
    const db = createDatabase(env.DB);
    const world = await setupRouteTestWorld(db);
    const ctx = contextFor(db, world.member);

    const csvArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=csv`,
      world.member,
      ctx,
      world.projectId,
    );
    const csvRes = await exportRouteLoader(csvArgs);
    expect(csvRes.status).toBe(403);

    const rowsArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=rows`,
      world.member,
      ctx,
      world.projectId,
    );
    const rowsRes = await exportRouteLoader(rowsArgs);
    expect(rowsRes.status).toBe(403);
  });

  it("FR-32 c3 / P3: returns 404 Not Found when non-member requests export in csv or rows", async () => {
    const db = createDatabase(env.DB);
    const world = await setupRouteTestWorld(db);
    const ctx = contextFor(db, world.nonMember);

    const csvArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=csv`,
      world.nonMember,
      ctx,
      world.projectId,
    );
    const csvRes = await exportRouteLoader(csvArgs);
    expect(csvRes.status).toBe(404);

    const rowsArgs = await requestFor(
      `http://localhost/api/projects/${world.projectId}/export?format=rows`,
      world.nonMember,
      ctx,
      world.projectId,
    );
    const rowsRes = await exportRouteLoader(rowsArgs);
    expect(rowsRes.status).toBe(404);
  });
});
