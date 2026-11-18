import { z } from "zod";

export const AttachmentIdSchema = z.object({
  attachmentId: z.string().trim().min(1, "Attachment ID is required"),
});
export type AttachmentIdInput = z.infer<typeof AttachmentIdSchema>;

export const AttachmentUploadSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required"),
  taskId: z.string().trim().min(1, "Task ID is required"),
});
export type AttachmentUploadParams = z.infer<typeof AttachmentUploadSchema>;
