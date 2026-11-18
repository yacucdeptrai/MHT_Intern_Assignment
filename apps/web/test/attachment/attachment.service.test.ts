import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, taskStatusRepository } from "@pm/db";
import {
  ForbiddenError,
  MAX_ATTACHMENT_BYTES,
  NotFoundError,
  ValidationError,
  type FileBody,
  type FileStorage,
  type StoredFile,
} from "@pm/domain";

import { attachmentService } from "../../app/services/attachment.service";
import { projectMemberService } from "../../app/services/project/projectMember.service";
import { projectService } from "../../app/services/project/project.service";
import { taskService } from "../../app/services/task.service";
import { createRequestContext } from "../../app/utils/requestContext.server";
import { createUser } from "../factories";

class MemoryFileStorage implements FileStorage {
  private files = new Map<string, { body: Uint8Array; contentType: string }>();

  get size(): number {
    return this.files.size;
  }

  async put(key: string, body: FileBody, options: { contentType: string }): Promise<void> {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    this.files.set(key, { body: bytes, contentType: options.contentType });
  }

  get(key: string): Promise<StoredFile | null> {
    const file = this.files.get(key);
    if (!file) return Promise.resolve(null);
    return Promise.resolve({
      key,
      size: file.body.byteLength,
      contentType: file.contentType,
      body: new Response(file.body as unknown as BodyInit).body as ReadableStream<Uint8Array>,
    });
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  has(key: string): boolean {
    return this.files.has(key);
  }
}

describe("attachmentService (FR-18, A23, A24)", () => {
  const dummyWaitUntil = () => {};

  async function createFixture() {
    const db = createDatabase(env.DB);
    const memoryStorage = new MemoryFileStorage();
    const adminUser = await createUser(db, { systemRole: "ADMIN", fullName: "Admin User" });
    const memberUser = await createUser(db, { systemRole: "MEMBER", fullName: "Member User" });
    const otherUser = await createUser(db, { systemRole: "MEMBER", fullName: "Other User" });

    const adminCtx = createRequestContext(env, { waitUntil: dummyWaitUntil }, new Request("http://localhost"));
    adminCtx.user = adminUser;
    adminCtx.storage = memoryStorage;

    const project = await projectService.createProject(adminCtx, {
      code: `AT${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      name: "Attachment Test Project",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
    });

    await projectMemberService.addMember(adminCtx, project.id, {
      userId: memberUser.id,
      projectRole: "MEMBER",
    });

    let todoStatus = await taskStatusRepository.findDefaultByCategory(adminCtx.db, "TODO");
    if (!todoStatus) {
      todoStatus = await taskStatusRepository.insert(adminCtx.db, {
        id: crypto.randomUUID(),
        name: `Todo ${crypto.randomUUID().slice(0, 4)}`,
        category: "TODO",
        position: 0,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const task = await taskService.createTask(adminCtx, project.id, {
      title: "Attachment Task",
      statusId: todoStatus.id,
    });

    const memberCtx = createRequestContext(env, { waitUntil: dummyWaitUntil }, new Request("http://localhost"));
    memberCtx.user = memberUser;
    memberCtx.storage = memoryStorage;

    const otherCtx = createRequestContext(env, { waitUntil: dummyWaitUntil }, new Request("http://localhost"));
    otherCtx.user = otherUser;
    otherCtx.storage = memoryStorage;

    return {
      adminCtx,
      memberCtx,
      otherCtx,
      adminUser,
      memberUser,
      otherUser,
      project,
      task,
      storage: memoryStorage,
    };
  }

  describe("uploadAttachment (FR-18 c1, c2, A23)", () => {
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    it("FR-18 c1: uploads a valid attachment, stores in R2, and audits ATTACHMENT_ADDED", async () => {
      const { memberCtx, project, task, storage } = await createFixture();

      const result = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "specs.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      expect(result.id).toBeDefined();
      expect(result.fileName).toBe("specs.pdf");
      expect(result.contentType).toBe("application/pdf");
      expect(result.sizeBytes).toBe(validPdfBytes.byteLength);
      expect(result.canDelete).toBe(true);

      const expectedKey = `projects/${project.id}/tasks/${task.id}/${result.id}`;
      expect(storage.has(expectedKey)).toBe(true);
    });

    it("FR-18 c2: accepts exactly 10,485,760 bytes (10 MB exact boundary)", async () => {
      const { memberCtx, project, task, storage } = await createFixture();

      const exact10MbBytes = new Uint8Array(MAX_ATTACHMENT_BYTES);
      // Valid PDF signature at start
      exact10MbBytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

      const result = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "exact10mb.pdf",
        contentType: "application/pdf",
        bytes: exact10MbBytes,
        size: MAX_ATTACHMENT_BYTES,
      });

      expect(result.sizeBytes).toBe(10485760);
      const expectedKey = `projects/${project.id}/tasks/${task.id}/${result.id}`;
      expect(storage.has(expectedKey)).toBe(true);
    });

    it("FR-18 c2: rejects file of 10,485,761 bytes with 400 'File is larger than 10 MB' and stores nothing in R2", async () => {
      const { memberCtx, project, task, storage } = await createFixture();

      const over10MbBytes = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
      over10MbBytes.set([0x25, 0x50, 0x44, 0x46]);

      await expect(
        attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
          fileName: "over10mb.pdf",
          contentType: "application/pdf",
          bytes: over10MbBytes,
          size: MAX_ATTACHMENT_BYTES + 1,
        }),
      ).rejects.toThrow("File is larger than 10 MB");

      expect(storage.size).toBe(0);
    });

    it("rejects disguised file (HTML spoofed as image/png)", async () => {
      const { memberCtx, project, task, storage } = await createFixture();
      const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body>bad</body></html>");

      await expect(
        attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
          fileName: "picture.png",
          contentType: "image/png",
          bytes: htmlBytes,
          size: htmlBytes.byteLength,
        }),
      ).rejects.toThrow(ValidationError);

      expect(storage.size).toBe(0);
    });

    it("cleans up R2 object if database batch fails", async () => {
      const { memberCtx, project, storage } = await createFixture();

      // Force DB failure by invalid task ID
      await expect(
        attachmentService.uploadAttachment(memberCtx, project.id, "non-existent-task-id", {
          fileName: "test.pdf",
          contentType: "application/pdf",
          bytes: validPdfBytes,
          size: validPdfBytes.byteLength,
        }),
      ).rejects.toThrow(NotFoundError);

      expect(storage.size).toBe(0);
    });

    it("rejects upload in archived project with 403 'This project is archived' for Admin and 404 for member", async () => {
      const { adminCtx, memberCtx, project, task } = await createFixture();

      await projectService.archiveProject(adminCtx, project.id);

      // Admin sees the project as archived and gets 403
      await expect(
        attachmentService.uploadAttachment(adminCtx, project.id, task.id, {
          fileName: "test.pdf",
          contentType: "application/pdf",
          bytes: validPdfBytes,
          size: validPdfBytes.byteLength,
        }),
      ).rejects.toThrow("This project is archived");

      // Member cannot see archived project and gets 404
      await expect(
        attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
          fileName: "test.pdf",
          contentType: "application/pdf",
          bytes: validPdfBytes,
          size: validPdfBytes.byteLength,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects upload by non-member with 404 'Project not found'", async () => {
      const { otherCtx, project, task } = await createFixture();

      await expect(
        attachmentService.uploadAttachment(otherCtx, project.id, task.id, {
          fileName: "test.pdf",
          contentType: "application/pdf",
          bytes: validPdfBytes,
          size: validPdfBytes.byteLength,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("downloadAttachment (FR-18 c3)", () => {
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    it("FR-18 c3: member can download attachment", async () => {
      const { memberCtx, project, task } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "guide.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      const downloaded = await attachmentService.downloadAttachment(memberCtx, project.id, uploaded.id);
      expect(downloaded.fileName).toBe("guide.pdf");
      expect(downloaded.contentType).toBe("application/pdf");
      expect(downloaded.size).toBe(validPdfBytes.byteLength);
      expect(downloaded.stream).toBeDefined();
    });

    it("FR-18 c3: non-member gets 404 'Project not found' when requesting attachment download", async () => {
      const { memberCtx, otherCtx, project, task } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "secret.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      await expect(attachmentService.downloadAttachment(otherCtx, project.id, uploaded.id)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("deleteAttachment (FR-18 c4, A24)", () => {
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    it("FR-18 c4: uploader can delete attachment, and R2 delete is dispatched after commit", async () => {
      const { memberCtx, project, task, storage } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "delete-me.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      const key = `projects/${project.id}/tasks/${task.id}/${uploaded.id}`;
      expect(storage.has(key)).toBe(true);

      const scheduledPromises: Promise<unknown>[] = [];
      memberCtx.waitUntil = (p) => {
        scheduledPromises.push(p);
      };

      await attachmentService.deleteAttachment(memberCtx, project.id, task.id, {
        attachmentId: uploaded.id,
      });

      expect(scheduledPromises).toHaveLength(1);
      await Promise.all(scheduledPromises);
      expect(storage.has(key)).toBe(false);

      // Verify row is deleted
      await expect(attachmentService.downloadAttachment(memberCtx, project.id, uploaded.id)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("FR-18 c4: project PM / Admin can delete another member's attachment", async () => {
      const { adminCtx, memberCtx, project, task } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "member-file.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      await attachmentService.deleteAttachment(adminCtx, project.id, task.id, {
        attachmentId: uploaded.id,
      });

      await expect(attachmentService.downloadAttachment(adminCtx, project.id, uploaded.id)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("FR-18 c4: non-uploader project member gets 403 when trying to delete attachment", async () => {
      const { adminCtx, memberCtx, project, task } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "member-file.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      // Add a third user to the project as MEMBER
      const thirdUser = await createUser(memberCtx.db, { systemRole: "MEMBER", fullName: "Third User" });
      await projectMemberService.addMember(adminCtx, project.id, {
        userId: thirdUser.id,
        projectRole: "MEMBER",
      });

      const thirdCtx = createRequestContext(env, { waitUntil: dummyWaitUntil }, new Request("http://localhost"));
      thirdCtx.user = thirdUser;

      await expect(
        attachmentService.deleteAttachment(thirdCtx, project.id, task.id, {
          attachmentId: uploaded.id,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("double delete throws 409 ConflictError via conflictGuardStmt", async () => {
      const { memberCtx, project, task } = await createFixture();

      const uploaded = await attachmentService.uploadAttachment(memberCtx, project.id, task.id, {
        fileName: "file.pdf",
        contentType: "application/pdf",
        bytes: validPdfBytes,
        size: validPdfBytes.byteLength,
      });

      await attachmentService.deleteAttachment(memberCtx, project.id, task.id, {
        attachmentId: uploaded.id,
      });

      await expect(
        attachmentService.deleteAttachment(memberCtx, project.id, task.id, {
          attachmentId: uploaded.id,
        }),
      ).rejects.toThrow();
    });
  });
});
