import { notificationRepository, type Notification } from "@pm/db";
import {
  buildNotificationTargetUrl,
  NotFoundError,
  NotificationListQuerySchema,
  UnauthorizedError,
  type NotificationDto,
  type Page,
} from "@pm/domain";

import type { RequestContext } from "../utils/requestContext.server";

function toNotificationDto(item: Notification): NotificationDto {
  return {
    id: item.id,
    userId: item.userId,
    type: item.type,
    entityId: item.entityId,
    projectId: item.projectId,
    payload: item.payload,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    targetUrl: buildNotificationTargetUrl(item.projectId, item.entityId, item.type),
  };
}

export const notificationService = {
  async listNotifications(
    ctx: RequestContext,
    rawQuery?: unknown,
  ): Promise<{ notifications: Page<NotificationDto>; unreadCount: number }> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const query = NotificationListQuerySchema.parse(rawQuery ?? {});
    const [{ items, total }, unreadCount] = await Promise.all([
      notificationRepository.listByUserPaginated(ctx.db, ctx.user.id, query.page, query.pageSize),
      notificationRepository.countUnread(ctx.db, ctx.user.id),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

    return {
      notifications: {
        items: items.map(toNotificationDto),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages,
      },
      unreadCount,
    };
  },

  async markRead(ctx: RequestContext, notificationId: string): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const existing = await notificationRepository.findById(ctx.db, notificationId);
    // Security check: must only ever touch caller's own rows; other user's notification returns 404
    if (!existing || existing.userId !== ctx.user.id) {
      throw new NotFoundError("Notification not found");
    }

    if (existing.readAt === null) {
      const now = ctx.clock.now();
      await notificationRepository.markReadStmt(ctx.db, notificationId, ctx.user.id, now);
      ctx.logger.info("Notification marked as read", {
        notificationId,
        userId: ctx.user.id,
        requestId: ctx.requestId,
      });
    }
  },

  async markAllRead(ctx: RequestContext): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const now = ctx.clock.now();
    await notificationRepository.markAllReadStmt(ctx.db, ctx.user.id, now);
    ctx.logger.info("All notifications marked as read", {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  },
};
