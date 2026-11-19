import { beforeEach, describe, it } from "vitest";

import { attachmentService } from "../../app/services/attachment.service";
import { commentService } from "../../app/services/comment.service";
import { taskService } from "../../app/services/task.service";
import {
  assertPermission,
  setupPermissionFixture,
  type ExpectedPermission,
  type MatrixActor,
  type PermissionFixture,
} from "./helpers";

describe("Task Permission Matrix (docs/05 §3.2 & docs/09 §3.1)", () => {
  let fixture: PermissionFixture;

  beforeEach(async () => {
    fixture = await setupPermissionFixture();
  });

  const runMatrix = (
    actionName: string,
    cases: Array<[MatrixActor, ExpectedPermission]>,
    execute: (actor: MatrixActor) => Promise<unknown>,
  ) => {
    describe(actionName, () => {
      for (const [actor, expected] of cases) {
        it(`${actor} -> ${expected}`, async () => {
          await assertPermission(() => execute(actor), expected);
        });
      }
    });
  };

  runMatrix(
    "createTask",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", "allow"],
      ["otherMember", "allow"],
      ["nonMember", 404],
    ],
    async (actor) => {
      await taskService.createTask(fixture.makeCtx(actor), fixture.projectId, {
        title: `Task by ${actor}`,
      });
    },
  );

  runMatrix(
    "editTask",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", "allow"],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask();
      await taskService.updateTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        title: `Updated by ${actor}`,
        version: task.version,
      });
    },
  );

  runMatrix(
    "changeStatus (non-Done transition)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", "allow"],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask({ statusId: fixture.todoStatusId });
      await taskService.changeStatus(fixture.makeCtx(actor), fixture.projectId, task.id, {
        statusId: fixture.inProgressStatusId,
        version: task.version,
      });
    },
  );

  runMatrix(
    "archiveTask",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask();
      await taskService.archiveTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        version: task.version,
      });
    },
  );

  runMatrix(
    "assignTask",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask();
      await taskService.assignTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        assigneeIds: [fixture.actors.creator.id],
        version: task.version,
      });
    },
  );

  runMatrix(
    "approveTask (in Review)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask({ statusId: fixture.reviewStatusId });
      await taskService.approveTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        version: task.version,
      });
    },
  );

  runMatrix(
    "rejectTask (in Review)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask({ statusId: fixture.reviewStatusId });
      await taskService.rejectTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        reason: "Needs more work",
        version: task.version,
      });
    },
  );

  runMatrix(
    "reopenTask (in Done)",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", 403],
      ["assignee", 403],
      ["otherMember", 403],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask({ statusId: fixture.doneStatusId });
      await taskService.reopenTask(fixture.makeCtx(actor), fixture.projectId, task.id, {
        reason: "Reopening ticket",
        version: task.version,
      });
    },
  );

  runMatrix(
    "addComment",
    [
      ["admin", "allow"],
      ["projectPm", "allow"],
      ["projectLead", "allow"],
      ["creator", "allow"],
      ["assignee", "allow"],
      ["otherMember", "allow"],
      ["nonMember", 404],
    ],
    async (actor) => {
      const task = await fixture.createTestTask();
      await commentService.addComment(fixture.makeCtx(actor), fixture.projectId, task.id, {
        body: `Comment from ${actor}`,
      });
    },
  );

  describe("deleteComment", () => {
    it("author can delete own comment", async () => {
      const task = await fixture.createTestTask();
      const comment = await commentService.addComment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
        body: "To be deleted",
      });
      await assertPermission(
        () =>
          commentService.deleteComment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
            commentId: comment.id,
          }),
        "allow",
      );
    });

    it("project PM can delete any comment", async () => {
      const task = await fixture.createTestTask();
      const comment = await commentService.addComment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        body: "Creator comment",
      });
      await assertPermission(
        () =>
          commentService.deleteComment(fixture.makeCtx("projectPm"), fixture.projectId, task.id, {
            commentId: comment.id,
          }),
        "allow",
      );
    });

    it("admin can delete any comment", async () => {
      const task = await fixture.createTestTask();
      const comment = await commentService.addComment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        body: "Creator comment",
      });
      await assertPermission(
        () =>
          commentService.deleteComment(fixture.makeCtx("admin"), fixture.projectId, task.id, {
            commentId: comment.id,
          }),
        "allow",
      );
    });

    it("non-author member cannot delete comment (403)", async () => {
      const task = await fixture.createTestTask();
      const comment = await commentService.addComment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        body: "Creator comment",
      });
      await assertPermission(
        () =>
          commentService.deleteComment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
            commentId: comment.id,
          }),
        403,
      );
    });

    it("non-member cannot delete comment (404)", async () => {
      const task = await fixture.createTestTask();
      const comment = await commentService.addComment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        body: "Creator comment",
      });
      await assertPermission(
        () =>
          commentService.deleteComment(fixture.makeCtx("nonMember"), fixture.projectId, task.id, {
            commentId: comment.id,
          }),
        404,
      );
    });
  });

  const validTextBytes = new TextEncoder().encode("Valid text file content for permission tests");

  describe("attachment operations", () => {
    it("members can upload attachment", async () => {
      const task = await fixture.createTestTask();
      await assertPermission(
        () =>
          attachmentService.uploadAttachment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
            fileName: "test.txt",
            contentType: "text/plain",
            bytes: validTextBytes,
            size: validTextBytes.length,
          }),
        "allow",
      );
    });

    it("non-members cannot upload attachment (404)", async () => {
      const task = await fixture.createTestTask();
      await assertPermission(
        () =>
          attachmentService.uploadAttachment(fixture.makeCtx("nonMember"), fixture.projectId, task.id, {
            fileName: "test.txt",
            contentType: "text/plain",
            bytes: validTextBytes,
            size: validTextBytes.length,
          }),
        404,
      );
    });

    it("uploader can delete own attachment", async () => {
      const task = await fixture.createTestTask();
      const att = await attachmentService.uploadAttachment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
        fileName: "test.txt",
        contentType: "text/plain",
        bytes: validTextBytes,
        size: validTextBytes.length,
      });
      await assertPermission(
        () =>
          attachmentService.deleteAttachment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
            attachmentId: att.id,
          }),
        "allow",
      );
    });

    it("project PM can delete any attachment", async () => {
      const task = await fixture.createTestTask();
      const att = await attachmentService.uploadAttachment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        fileName: "test.txt",
        contentType: "text/plain",
        bytes: validTextBytes,
        size: validTextBytes.length,
      });
      await assertPermission(
        () =>
          attachmentService.deleteAttachment(fixture.makeCtx("projectPm"), fixture.projectId, task.id, {
            attachmentId: att.id,
          }),
        "allow",
      );
    });

    it("admin can delete any attachment", async () => {
      const task = await fixture.createTestTask();
      const att = await attachmentService.uploadAttachment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        fileName: "test.txt",
        contentType: "text/plain",
        bytes: validTextBytes,
        size: validTextBytes.length,
      });
      await assertPermission(
        () =>
          attachmentService.deleteAttachment(fixture.makeCtx("admin"), fixture.projectId, task.id, {
            attachmentId: att.id,
          }),
        "allow",
      );
    });

    it("non-uploader member cannot delete attachment (403)", async () => {
      const task = await fixture.createTestTask();
      const att = await attachmentService.uploadAttachment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        fileName: "test.txt",
        contentType: "text/plain",
        bytes: validTextBytes,
        size: validTextBytes.length,
      });
      await assertPermission(
        () =>
          attachmentService.deleteAttachment(fixture.makeCtx("otherMember"), fixture.projectId, task.id, {
            attachmentId: att.id,
          }),
        403,
      );
    });

    it("non-member cannot delete attachment (404)", async () => {
      const task = await fixture.createTestTask();
      const att = await attachmentService.uploadAttachment(fixture.makeCtx("creator"), fixture.projectId, task.id, {
        fileName: "test.txt",
        contentType: "text/plain",
        bytes: validTextBytes,
        size: validTextBytes.length,
      });
      await assertPermission(
        () =>
          attachmentService.deleteAttachment(fixture.makeCtx("nonMember"), fixture.projectId, task.id, {
            attachmentId: att.id,
          }),
        404,
      );
    });
  });
});
