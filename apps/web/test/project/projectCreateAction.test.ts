import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, projectRepository, userRepository } from "@pm/db";
import { projectCreateAction } from "../../app/actions/projectCreateAction";
import { commitSession, getSession } from "../../app/utils/session.server";
import type { RequestContext } from "../../app/utils/requestContext.server";

interface ActionResponseData {
  success: boolean;
  errors: Record<string, string[]>;
  values: Record<string, string>;
}

async function createTestContext(
  role: "ADMIN" | "PM" | "TEAM_LEAD" | "MEMBER",
): Promise<{ ctx: RequestContext; cookie: string; user: { id: string } }> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const id = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${id.slice(0, 4)}-${Date.now()}@example.com`;

  const user = await userRepository.insert(db, {
    id,
    email,
    fullName: `${role} User`,
    systemRole: role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const session = await getSession(new Request("http://localhost"), env.SESSION_SECRET);
  session.set("userId", user.id);
  const cookie = await commitSession(session, { secret: env.SESSION_SECRET });

  const ctx: RequestContext = {
    env,
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

describe("projectCreateAction", () => {
  it("FR-07 c1: creates project and redirects to /projects when submitted by PM", async () => {
    const { ctx, cookie } = await createTestContext("PM");
    const code = `NEW-${Date.now().toString().slice(-4)}`;

    const formData = new FormData();
    formData.append("code", code);
    formData.append("name", "New Project");
    formData.append("description", "A brand new project");
    formData.append("budget", "20000000");
    formData.append("startDate", "2026-11-01");
    formData.append("endDate", "2026-12-31");

    const req = new Request("http://localhost/projects/new", {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectCreateAction(ctx, req);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/projects");

    const created = await projectRepository.findByCode(ctx.db, code);
    expect(created).toBeDefined();
    expect(created?.name).toBe("New Project");
  });

  it("FR-07 c2: returns 400 and keeps input when project code already exists", async () => {
    const { ctx, cookie } = await createTestContext("PM");
    const code = `EXT-${Date.now().toString().slice(-4)}`;

    // First creation
    const form1 = new FormData();
    form1.append("code", code);
    form1.append("name", "Original");
    form1.append("startDate", "2026-11-01");
    form1.append("endDate", "2026-12-31");

    const res1 = await projectCreateAction(
      ctx,
      new Request("http://localhost/projects/new", {
        method: "POST",
        headers: { Cookie: cookie },
        body: form1,
      }),
    );
    expect(res1.status).toBe(302);

    // Second creation with duplicate code
    const form2 = new FormData();
    form2.append("code", code);
    form2.append("name", "Duplicate Attempt");
    form2.append("startDate", "2026-11-01");
    form2.append("endDate", "2026-12-31");

    const res2 = await projectCreateAction(
      ctx,
      new Request("http://localhost/projects/new", {
        method: "POST",
        headers: { Cookie: cookie },
        body: form2,
      }),
    );
    expect(res2.status).toBe(400);

    const data = await res2.json<ActionResponseData>();
    expect(data.success).toBe(false);
    expect(data.errors.code).toContain("Project code is already in use");
    expect(data.values.name).toBe("Duplicate Attempt");
  });

  it("FR-07 c3: returns 400 when end date is before start date", async () => {
    const { ctx, cookie } = await createTestContext("PM");
    const code = `INV-${Date.now().toString().slice(-4)}`;

    const formData = new FormData();
    formData.append("code", code);
    formData.append("name", "Invalid Dates");
    formData.append("startDate", "2026-12-31");
    formData.append("endDate", "2026-11-01");

    const req = new Request("http://localhost/projects/new", {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectCreateAction(ctx, req);
    expect(res.status).toBe(400);

    const data = await res.json<ActionResponseData>();
    expect(data.success).toBe(false);
    expect(data.errors.endDate).toContain("End date must be on or after start date");
  });

  it("FR-07 c4: rejects system MEMBER with 403", async () => {
    const { ctx, cookie } = await createTestContext("MEMBER");

    const formData = new FormData();
    formData.append("code", "MEM-01");
    formData.append("name", "Member Attempt");
    formData.append("startDate", "2026-11-01");
    formData.append("endDate", "2026-12-31");

    const req = new Request("http://localhost/projects/new", {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectCreateAction(ctx, req);
    expect(res.status).toBe(403);
  });

  it("FR-07 c4: rejects system TEAM_LEAD with 403", async () => {
    const { ctx, cookie } = await createTestContext("TEAM_LEAD");

    const formData = new FormData();
    formData.append("code", "LEAD-01");
    formData.append("name", "Lead Attempt");
    formData.append("startDate", "2026-11-01");
    formData.append("endDate", "2026-12-31");

    const req = new Request("http://localhost/projects/new", {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
    });

    const res = await projectCreateAction(ctx, req);
    expect(res.status).toBe(403);
  });
});
