import { z } from "zod";

import type { NotificationType } from "../enums";

export const NotificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const MarkReadSchema = z.object({
  notificationId: z.string().trim().min(1, "Notification ID is required"),
});

export type MarkReadInput = z.infer<typeof MarkReadSchema>;

export function buildNotificationTargetUrl(projectId: string, entityId: string, type: NotificationType): string {
  if (type === "PROJECT_MEMBER_ADDED") {
    return `/projects/${projectId}`;
  }
  return `/projects/${projectId}/tasks/${entityId}`;
}
