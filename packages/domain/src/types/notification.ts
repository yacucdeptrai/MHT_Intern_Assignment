import type { NotificationType } from "../enums";
import type { Page } from "./common";

export interface NotificationPayload {
  title: string;
  actorName: string;
  reason?: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  type: NotificationType;
  entityId: string;
  projectId: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
  targetUrl: string;
}

export interface NotificationCenterLoaderData {
  notifications: Page<NotificationDto>;
  unreadCount: number;
}
