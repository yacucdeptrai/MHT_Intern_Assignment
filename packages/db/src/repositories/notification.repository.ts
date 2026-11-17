import { desc, eq } from "drizzle-orm";

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
};
