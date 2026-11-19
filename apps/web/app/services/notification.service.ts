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
      throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
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
      throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
    }

    const existing = await notificationRepository.findById(ctx.db, notificationId);
    // Security check: must only ever touch caller's own rows; other user's notification returns 404
    if (!existing || existing.userId !== ctx.user.id) {
      throw new NotFoundError("Notification not found", { key: "errors.notification_not_found" });
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
      throw new UnauthorizedError("Authentication required", { key: "errors.authentication_required" });
    }

    const now = ctx.clock.now();
    await notificationRepository.markAllReadStmt(ctx.db, ctx.user.id, now);
    ctx.logger.info("All notifications marked as read", {
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });
  },

  async publishNotifications(ctx: RequestContext, notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }

    try {
      const items = await notificationRepository.findByIds(ctx.db, notificationIds);
      if (items.length === 0) {
        return;
      }

      // Group notifications by recipient userId
      const byUser = new Map<string, NotificationDto[]>();
      for (const item of items) {
        const dto = toNotificationDto(item);
        const list = byUser.get(item.userId) ?? [];
        list.push(dto);
        byUser.set(item.userId, list);
      }

      for (const [userId, userNotifications] of byUser.entries()) {
        try {
          const hubId = ctx.env.NOTIFICATION_HUB.idFromName(userId);
          const hub = ctx.env.NOTIFICATION_HUB.get(hubId);
          for (const dto of userNotifications) {
            await hub.publish(dto);
          }
        } catch (hubErr) {
          ctx.logger.error("Failed to publish notification to hub", {
            userId,
            error: hubErr instanceof Error ? hubErr : new Error(String(hubErr)),
            requestId: ctx.requestId,
          });
        }
      }
    } catch (err) {
      // Swallowed: realtime notification failures must never roll back or fail the originating request
      ctx.logger.error("Failed to publish notifications", {
        error: err instanceof Error ? err : new Error(String(err)),
        notificationIds,
        requestId: ctx.requestId,
      });
    }
  },
};
