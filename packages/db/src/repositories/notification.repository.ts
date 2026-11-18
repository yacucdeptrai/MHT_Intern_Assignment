import { and, count, desc, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { notifications, type NewNotification, type Notification } from "../schema/notifications";

export const notificationRepository = {
  insertStmt(db: AppDatabase, notification: NewNotification) {
    return db.insert(notifications).values(notification);
  },

  insertManyStmt(db: AppDatabase, list: NewNotification[]) {
    if (list.length === 0) return null;
    return db.insert(notifications).values(list);
  },

  async listByUser(db: AppDatabase, userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  },

  async listByUserPaginated(
    db: AppDatabase,
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Notification[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [totalRes, items] = await Promise.all([
      db.select({ value: count() }).from(notifications).where(eq(notifications.userId, userId)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);
    return {
      items,
      total: totalRes[0]?.value ?? 0,
    };
  },

  async countUnread(db: AppDatabase, userId: string): Promise<number> {
    const res = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return res[0]?.value ?? 0;
  },

  async findById(db: AppDatabase, id: string): Promise<Notification | null> {
    const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return rows[0] ?? null;
  },

  markReadStmt(db: AppDatabase, id: string, userId: string, readAt: Date) {
    return db
      .update(notifications)
      .set({ readAt })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  },

  markAllReadStmt(db: AppDatabase, userId: string, readAt: Date) {
    return db
      .update(notifications)
      .set({ readAt })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  },
};
