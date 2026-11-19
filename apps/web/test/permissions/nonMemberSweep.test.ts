import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { attachmentRepository } from "@pm/db";
import { ForbiddenError, NotFoundError } from "@pm/domain";

import { projectMembersAction } from "../../app/actions/projectMembersAction";
import { projectSettingsAction } from "../../app/actions/projectSettingsAction";
import { projectTasksAction } from "../../app/actions/projectTasksAction";
import { sprintsAction } from "../../app/actions/sprintsAction";
import { taskDetailAction } from "../../app/actions/taskDetailAction";
import { projectHeaderLoader } from "../../app/loaders/projectHeaderLoader";
import { projectMembersLoader } from "../../app/loaders/projectMembersLoader";
import { projectReportsLoader } from "../../app/loaders/projectReportsLoader";
import { projectSettingsLoader } from "../../app/loaders/projectSettingsLoader";
import { projectTasksLoader } from "../../app/loaders/projectTasksLoader";
import { sprintsLoader } from "../../app/loaders/sprintsLoader";
import { taskDetailLoader } from "../../app/loaders/taskDetailLoader";
import { loader as attachmentLoader } from "../../app/routes/api.attachments.$attachmentId";
import { action as attachmentUploadAction } from "../../app/routes/api.attachments.upload";
import { loader as exportLoader } from "../../app/routes/api.projects.$projectId.export";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";
import { setupPermissionFixture, type PermissionFixture } from "./helpers";

interface ExecutionResult {
  status: number;
  message?: string;
  isRedirect: boolean;
}

async function executeSweepTarget(fn: () => Promise<unknown>): Promise<ExecutionResult> {
  try {
    const res = await fn();
    if (res instanceof Response) {
      const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
      let message = "";
      try {
        message = await res.clone().text();
      } catch {
        // Ignore unreadable response body
      }
      return { status: res.status, message, isRedirect };
    }
    return { status: 200, isRedirect: false };
  } catch (err: unknown) {
    if (err instanceof Response) {
      const isRedirect = [301, 302, 303, 307, 308].includes(err.status);
      let message = "";
      try {
        message = await err.clone().text();
      } catch {
        // Ignore unreadable response body
      }
      return { status: err.status, message, isRedirect };
    }
    if (err instanceof NotFoundError) {
      return { status: 404, message: err.message, isRedirect: false };
    }
    if (err instanceof ForbiddenError) {
      return { status: 403, message: err.message, isRedirect: false };
    }
    throw err;
  }
}

describe("Non-Member 404 Sweep (Routes §3.4–3.6 & docs/05 §2)", () => {
  let fixture: PermissionFixture;
  let nonMemberCookie: string;
  let nonMemberCtx: RequestContext;
  let realTaskId: string;
  let realAttachmentId: string;
  const nonExistentProjectId = crypto.randomUUID();
  const nonExistentTaskId = crypto.randomUUID();
  const nonExistentAttachmentId = crypto.randomUUID();

  beforeEach(async () => {
    fixture = await setupPermissionFixture();
    nonMemberCtx = fixture.makeCtx("nonMember");

    const session = await getSession(new Request("http://localhost"), env.SESSION_SECRET);
    session.set("userId", fixture.actors.nonMember.id);
    nonMemberCookie = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });

    const task = await fixture.createTestTask();
    realTaskId = task.id;

    realAttachmentId = crypto.randomUUID();
    const now = new Date();
    await fixture.db.batch([
      attachmentRepository.insertStmt(fixture.db, {
        id: realAttachmentId,
        taskId: realTaskId,
        uploadedById: fixture.actors.creator.id,
        fileName: "doc.txt",
        contentType: "text/plain",
        sizeBytes: 100,
        storageKey: `attachments/${fixture.projectId}/${realTaskId}/${realAttachmentId}-doc.txt`,
        createdAt: now,
      }),
    ]);
  });

  const createGetRequest = (url: string) => {
    return new Request(url, {
      headers: { Cookie: nonMemberCookie },
    });
  };

  const createPostRequest = (url: string, formData: FormData) => {
    return new Request(url, {
      method: "POST",
      headers: { Cookie: nonMemberCookie },
      body: formData,
    });
  };

  const makeRouteContext = (ctx: RequestContext) => {
    const map = new Map<unknown, unknown>();
    map.set(requestContextKey, ctx);
    return {
      get: (k: unknown) => map.get(k),
    };
  };

  interface SweepTarget {
    name: string;
    kind: "loader" | "action";
    execute: (projectId: string, taskId: string, attachmentId: string) => Promise<unknown>;
  }

  const targets: SweepTarget[] = [
    // 9 Loaders
    {
      name: "projectHeaderLoader",
      kind: "loader",
      execute: (pId) => projectHeaderLoader(nonMemberCtx, createGetRequest(`http://localhost/projects/${pId}`), pId),
    },
    {
      name: "projectTasksLoader",
      kind: "loader",
      execute: (pId) =>
        projectTasksLoader(nonMemberCtx, pId, createGetRequest(`http://localhost/projects/${pId}/tasks`)),
    },
    {
      name: "taskDetailLoader",
      kind: "loader",
      execute: (pId, tId) =>
        taskDetailLoader(nonMemberCtx, pId, tId, createGetRequest(`http://localhost/projects/${pId}/tasks/${tId}`)),
    },
    {
      name: "sprintsLoader",
      kind: "loader",
      execute: (pId) => sprintsLoader(nonMemberCtx, createGetRequest(`http://localhost/projects/${pId}/sprints`), pId),
    },
    {
      name: "projectMembersLoader",
      kind: "loader",
      execute: (pId) =>
        projectMembersLoader(nonMemberCtx, createGetRequest(`http://localhost/projects/${pId}/members`), pId),
    },
    {
      name: "projectSettingsLoader",
      kind: "loader",
      execute: (pId) =>
        projectSettingsLoader(nonMemberCtx, createGetRequest(`http://localhost/projects/${pId}/settings`), pId),
    },
    {
      name: "projectReportsLoader",
      kind: "loader",
      execute: (pId) =>
        projectReportsLoader(nonMemberCtx, createGetRequest(`http://localhost/projects/${pId}/reports`), pId),
    },
    {
      name: "exportLoader",
      kind: "loader",
      execute: (pId) => {
        const req = createGetRequest(`http://localhost/api/projects/${pId}/export?format=csv`);
        const args = {
          context: makeRouteContext(nonMemberCtx),
          params: { projectId: pId },
          request: req,
        } as unknown as Parameters<typeof exportLoader>[0];
        return exportLoader(args);
      },
    },
    {
      name: "attachmentLoader",
      kind: "loader",
      execute: (pId, _tId, aId) => {
        const req = createGetRequest(`http://localhost/api/attachments/${aId}?projectId=${pId}`);
        const args = {
          context: makeRouteContext(nonMemberCtx),
          params: { attachmentId: aId },
          request: req,
        } as unknown as Parameters<typeof attachmentLoader>[0];
        return attachmentLoader(args);
      },
    },

    // 6 Actions
    {
      name: "projectTasksAction",
      kind: "action",
      execute: (pId) => {
        const form = new FormData();
        form.append("intent", "createTask");
        form.append("title", "Sweep task");
        return projectTasksAction(nonMemberCtx, pId, createPostRequest(`http://localhost/projects/${pId}/tasks`, form));
      },
    },
    {
      name: "taskDetailAction",
      kind: "action",
      execute: (pId, tId) => {
        const form = new FormData();
        form.append("intent", "update");
        form.append("title", "Updated title");
        form.append("version", "1");
        return taskDetailAction(
          nonMemberCtx,
          pId,
          tId,
          createPostRequest(`http://localhost/projects/${pId}/tasks/${tId}`, form),
        );
      },
    },
    {
      name: "sprintsAction",
      kind: "action",
      execute: (pId) => {
        const form = new FormData();
        form.append("intent", "create");
        form.append("name", "Sprint 1");
        form.append("startDate", "2026-03-01");
        form.append("endDate", "2026-03-14");
        return sprintsAction(nonMemberCtx, createPostRequest(`http://localhost/projects/${pId}/sprints`, form), pId);
      },
    },
    {
      name: "projectMembersAction",
      kind: "action",
      execute: (pId) => {
        const form = new FormData();
        form.append("intent", "add");
        form.append("userId", fixture.actors.otherMember.id);
        form.append("projectRole", "MEMBER");
        return projectMembersAction(
          nonMemberCtx,
          createPostRequest(`http://localhost/projects/${pId}/members`, form),
          pId,
        );
      },
    },
    {
      name: "projectSettingsAction",
      kind: "action",
      execute: (pId) => {
        const form = new FormData();
        form.append("intent", "update");
        form.append("name", "Updated Project Name");
        return projectSettingsAction(
          nonMemberCtx,
          createPostRequest(`http://localhost/projects/${pId}/settings`, form),
          pId,
        );
      },
    },
    {
      name: "attachmentUploadAction",
      kind: "action",
      execute: (pId, tId) => {
        const form = new FormData();
        form.append("projectId", pId);
        form.append("taskId", tId);
        form.append("file", new File(["test file content"], "doc.txt", { type: "text/plain" }));
        const req = createPostRequest("http://localhost/api/attachments/upload", form);
        const args = {
          context: makeRouteContext(nonMemberCtx),
          params: {},
          request: req,
        } as unknown as Parameters<typeof attachmentUploadAction>[0];
        return attachmentUploadAction(args);
      },
    },
  ];

  it("asserts non-member returns/throws 404 identical to non-existent project for all 15 project loaders and actions", async () => {
    expect(targets).toHaveLength(15);

    for (const target of targets) {
      // 1. Non-member accessing real project resource
      const nonMemberRes = await executeSweepTarget(() =>
        target.execute(fixture.projectId, realTaskId, realAttachmentId),
      );

      // 2. Caller accessing non-existent project resource
      const nonExistentRes = await executeSweepTarget(() =>
        target.execute(nonExistentProjectId, nonExistentTaskId, nonExistentAttachmentId),
      );

      // Assertions per docs/05 §2 and AGENTS.md:
      // Must be 404 (never 403, never redirect)
      expect(
        nonMemberRes.status,
        `${target.name} must return/throw 404 for non-member, got ${nonMemberRes.status}`,
      ).toBe(404);

      expect(
        nonMemberRes.isRedirect,
        `${target.name} must never redirect non-member (got status ${nonMemberRes.status})`,
      ).toBe(false);

      expect(
        nonExistentRes.status,
        `${target.name} must return/throw 404 for non-existent project, got ${nonExistentRes.status}`,
      ).toBe(404);

      expect(nonExistentRes.isRedirect, `${target.name} must never redirect for non-existent project`).toBe(false);

      // Status must match exactly between non-member and non-existent project
      expect(nonMemberRes.status, `${target.name} non-member status must be identical to non-existent project`).toBe(
        nonExistentRes.status,
      );
    }
  });

  // Individual it blocks for clear reporting and failure isolation
  describe("Individual sweep assertions", () => {
    for (const target of targets) {
      it(`${target.kind}: ${target.name} -> 404 for non-member identical to non-existent project`, async () => {
        const nonMemberRes = await executeSweepTarget(() =>
          target.execute(fixture.projectId, realTaskId, realAttachmentId),
        );
        const nonExistentRes = await executeSweepTarget(() =>
          target.execute(nonExistentProjectId, nonExistentTaskId, nonExistentAttachmentId),
        );

        expect(nonMemberRes.status).toBe(404);
        expect(nonMemberRes.isRedirect).toBe(false);
        expect(nonExistentRes.status).toBe(404);
        expect(nonExistentRes.isRedirect).toBe(false);
        expect(nonMemberRes.status).toBe(nonExistentRes.status);
      });
    }
  });
});
