import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { auditLogRepository, createDatabase, userRepository } from "@pm/db";
import { AUDIT_EXPORT_COLUMNS, formatCsv } from "@pm/domain";

import { loader as auditExportLoader } from "../../app/routes/api.admin.audit-log.export";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

type Role = "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER";
const NOW = new Date("2026-11-19T08:00:00Z");

async function makeUser(db: ReturnType<typeof createDatabase>, role: Role) {
  const id = crypto.randomUUID();
  const email = `audit-export-${role.toLowerCase()}-${id}@example.com`;
  await userRepository.insert(db, {
    id,
    email,
    fullName: `Audit Export ${role}`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { id, email, systemRole: role };
}

function contextFor(db: ReturnType<typeof createDatabase>, user: { id: string; email: string; systemRole: Role }) {
  const ctx: RequestContext = {
    env,
    db,
    user: { id: user.id, email: user.email, fullName: user.email, systemRole: user.systemRole, status: "ACTIVE" },
    requestId: "audit-export-route-test",
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    waitUntil: () => {},
    clock: { now: () => NOW },
  };
  return ctx;
}

async function argsFor(url: string, userId: string, ctx: RequestContext) {
  const session = await getSession(new Request(url), env.SESSION_SECRET);
  session.set("userId", userId);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });
  const map = new Map<unknown, unknown>([[requestContextKey, ctx]]);
  return {
    request: new Request(url, { headers: { Cookie: cookie } }),
    params: {},
    context: { get: (key: unknown) => map.get(key) },
  } as unknown as Parameters<typeof auditExportLoader>[0];
}

describe("GET /api/admin/audit-log/export (FR-24)", () => {
  it("FR-24: Admin downloads the filtered audit log as a CSV attachment", async () => {
    const db = createDatabase(env.DB);
    const admin = await makeUser(db, "ADMIN");
    const entityId = `user-${crypto.randomUUID()}`;
    await auditLogRepository.insert(db, {
      id: crypto.randomUUID(),
      actorId: admin.id,
      action: "USER_UPDATED",
      entityType: "USER",
      entityId,
      projectId: null,
      changes: { fullName: { from: "Old", to: "=HYPERLINK(1)" } },
      createdAt: NOW,
    });

    const ctx = contextFor(db, admin);
    const res = await auditExportLoader(
      await argsFor(`http://localhost/api/admin/audit-log/export?actorId=${admin.id}&entityType=USER`, admin.id, ctx),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain('filename="audit-log-2026-11-19.csv"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    const bom = String.fromCharCode(0xfeff);
    expect(text.startsWith(bom)).toBe(true);
    const [header, ...rows] = text.slice(bom.length).split("\r\n");
    expect(`${bom}${header}`).toBe(formatCsv([[...AUDIT_EXPORT_COLUMNS]]));
    expect(rows).toEqual([
      `${NOW.toISOString()},Audit Export ADMIN,USER_UPDATED,USER,${entityId},,fullName: Old → =HYPERLINK(1)`,
    ]);
  });

  it("FR-24 c4: non-Admin roles receive 403", async () => {
    const db = createDatabase(env.DB);
    for (const role of ["PM", "TEAM_LEAD", "MEMBER"] as const) {
      const user = await makeUser(db, role);
      const res = await auditExportLoader(
        await argsFor("http://localhost/api/admin/audit-log/export", user.id, contextFor(db, user)),
      );
      expect(res.status).toBe(403);
    }
  });

  it("FR-24 c2: an inverted date range is rejected with 400", async () => {
    const db = createDatabase(env.DB);
    const admin = await makeUser(db, "ADMIN");
    const res = await auditExportLoader(
      await argsFor(
        "http://localhost/api/admin/audit-log/export?from=2026-11-20&to=2026-11-10",
        admin.id,
        contextFor(db, admin),
      ),
    );
    expect(res.status).toBe(400);
  });
});
