import { attachmentRepository, auditLogRepository, conflictGuardStmt, isVersionConflict, taskRepository } from "@pm/db";
import {
  ConflictError,
  ForbiddenError,
  MAX_ATTACHMENT_BYTES,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  canDeleteAttachment,
  canUploadAttachment,
  sanitizeFileName,
  toActor,
  validateAttachmentContentType,
  type AttachmentDto,
  type AttachmentIdInput,
  type AttachmentUploadInput,
} from "@pm/domain";

import type { RequestContext } from "../utils/requestContext.server";
import { loadProjectAccess } from "../utils/auth.server";
import { R2FileStorage } from "./storage/r2FileStorage.server";

export interface DownloadAttachmentResult {
  stream: ReadableStream<Uint8Array>;
  fileName: string;
  contentType: string;
  size: number;
}

export const attachmentService = {
  async uploadAttachment(
    ctx: RequestContext,
    projectId: string,
    taskId: string,
    input: AttachmentUploadInput,
  ): Promise<AttachmentDto> {
    if (!ctx.user) {
      throw new UnauthorizedError("You must be logged in to upload attachments");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    if (!canUploadAttachment(actor)) {
      throw new ForbiddenError("You cannot upload attachments to this project");
    }

    const task = await taskRepository.findById(ctx.db, taskId);
    if (!task || task.projectId !== projectId || task.deletedAt !== null) {
      throw new NotFoundError("Task not found");
    }

    if (input.size > MAX_ATTACHMENT_BYTES || input.bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError("File is larger than 10 MB", {
        file: ["File is larger than 10 MB"],
      });
    }

    if (input.size < 1 || input.bytes.length < 1) {
      throw new ValidationError("File cannot be empty", {
        file: ["File cannot be empty"],
      });
    }

    const validatedType = validateAttachmentContentType(input.bytes, input.contentType);
    if (!validatedType) {
      throw new ValidationError("Unsupported or disguised file format", {
        file: ["Unsupported or disguised file format"],
      });
    }

    const safeFileName = sanitizeFileName(input.fileName);
    const attachmentId = crypto.randomUUID();
    const storageKey = `projects/${projectId}/tasks/${taskId}/${attachmentId}`;
    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);

    // Order of writes (docs/04 §5): R2 put happens BEFORE the batch
    await storage.put(storageKey, input.bytes, { contentType: validatedType });

    const now = ctx.clock.now();
    try {
      await ctx.db.batch([
        attachmentRepository.insertStmt(ctx.db, {
          id: attachmentId,
          taskId,
          uploadedById: ctx.user.id,
          fileName: safeFileName,
          contentType: validatedType,
          sizeBytes: input.bytes.length,
          storageKey,
          createdAt: now,
        }),
        auditLogRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          actorId: ctx.user.id,
          action: "ATTACHMENT_ADDED",
          entityType: "TASK",
          entityId: taskId,
          projectId,
          changes: {
            attachmentId: { from: null, to: attachmentId },
            fileName: { from: null, to: safeFileName },
            sizeBytes: { from: null, to: input.bytes.length },
            contentType: { from: null, to: validatedType },
          },
          createdAt: now,
        }),
      ]);
    } catch (err: unknown) {
      // Clean up uploaded object if DB batch fails
      try {
        await storage.delete(storageKey);
      } catch (deleteErr: unknown) {
        ctx.logger.error("Failed to clean up attachment object after DB failure", {
          error: deleteErr instanceof Error ? deleteErr : new Error(String(deleteErr)),
          key: storageKey,
        });
      }
      // TODO(M7-T5): orphan sweep will clean up leftovers if worker dies
      throw err;
    }

    ctx.logger.info("Attachment uploaded successfully", {
      attachmentId,
      taskId,
      projectId,
      fileName: safeFileName,
      sizeBytes: input.bytes.length,
    });

    return {
      id: attachmentId,
      taskId,
      uploadedById: ctx.user.id,
      uploaderName: ctx.user.fullName,
      fileName: safeFileName,
      contentType: validatedType,
      sizeBytes: input.bytes.length,
      canDelete: true,
      createdAt: now.getTime(),
    };
  },

  /**
   * Access is always checked on the attachment's own project. `expectedProjectId` can only narrow
   * the result: a mismatch returns 404, never access to another project.
   */
  async downloadAttachment(
    ctx: RequestContext,
    attachmentId: string,
    options: { expectedProjectId?: string } = {},
  ): Promise<DownloadAttachmentResult> {
    const explicitProjectId = options.expectedProjectId;

    const attachment = await attachmentRepository.findById(ctx.db, attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found");
    }

    const task = await taskRepository.findById(ctx.db, attachment.taskId);
    if (!task || (explicitProjectId && task.projectId !== explicitProjectId) || task.deletedAt !== null) {
      throw new NotFoundError("Attachment not found");
    }

    // Non-members receive 404 (FR-18 c3, P3)
    await loadProjectAccess(ctx, task.projectId);

    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);
    const stored = await storage.get(attachment.storageKey);
    if (!stored) {
      throw new NotFoundError("Attachment file not found");
    }

    return {
      stream: stored.body,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.sizeBytes,
    };
  },

  async deleteAttachment(
    ctx: RequestContext,
    projectId: string,
    taskId: string,
    input: AttachmentIdInput,
  ): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError("You must be logged in to delete attachments");
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    // The task must belong to the project whose access was checked; otherwise a lead of one
    // project could delete another project's attachments by posting their own projectId.
    const task = await taskRepository.findById(ctx.db, taskId);
    if (!task || task.projectId !== projectId) {
      throw new NotFoundError("Attachment not found");
    }

    const attachment = await attachmentRepository.findById(ctx.db, input.attachmentId);
    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundError("Attachment not found");
    }

    if (!canDeleteAttachment(actor, attachment)) {
      throw new ForbiddenError("You cannot delete this attachment");
    }

    const now = ctx.clock.now();
    try {
      await ctx.db.batch([
        attachmentRepository.deleteStmt(ctx.db, attachment.id),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: crypto.randomUUID(),
          actorId: ctx.user.id,
          action: "ATTACHMENT_REMOVED",
          entityType: "TASK",
          entityId: taskId,
          projectId,
          changes: {
            attachmentId: { from: attachment.id, to: null },
            fileName: { from: attachment.fileName, to: null },
          },
          createdAt: now,
        }),
      ]);
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        throw new ConflictError("This attachment was already deleted or modified");
      }
      throw err;
    }

    // Order of writes (docs/04 §5): R2 delete happens AFTER commit via waitUntil
    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);
    ctx.waitUntil(storage.delete(attachment.storageKey));

    ctx.logger.info("Attachment deleted successfully", {
      attachmentId: attachment.id,
      taskId,
      projectId,
    });
  },
};
