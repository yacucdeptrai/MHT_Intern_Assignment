import { and, asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { taskStatuses, type NewTaskStatus, type TaskStatus } from "../schema/taskStatuses";

export const taskStatusRepository = {
  insertStmt(db: AppDatabase, status: NewTaskStatus) {
    return db.insert(taskStatuses).values(status);
  },

  async insert(db: AppDatabase, status: NewTaskStatus): Promise<TaskStatus> {
    const [inserted] = await db.insert(taskStatuses).values(status).returning();
    if (!inserted) {
      throw new Error("Failed to insert task status");
    }
    return inserted;
  },

  async findById(db: AppDatabase, id: string): Promise<TaskStatus | null> {
    const [result] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, id)).limit(1);
    return result ?? null;
  },

  async findByName(db: AppDatabase, name: string): Promise<TaskStatus | null> {
    const [result] = await db
      .select()
      .from(taskStatuses)
      .where(sql`LOWER(${taskStatuses.name}) = LOWER(${name})`)
      .limit(1);
    return result ?? null;
  },

  async findDefaultByCategory(db: AppDatabase, category: TaskStatus["category"]): Promise<TaskStatus | null> {
    const [result] = await db
      .select()
      .from(taskStatuses)
      .where(and(eq(taskStatuses.category, category), eq(taskStatuses.isDefault, true)))
      .limit(1);
    return result ?? null;
  },

  async list(db: AppDatabase): Promise<TaskStatus[]> {
    return db.select().from(taskStatuses).orderBy(asc(taskStatuses.position));
  },

  updateStmt(db: AppDatabase, id: string, patch: Partial<Omit<NewTaskStatus, "id">>) {
    return db.update(taskStatuses).set(patch).where(eq(taskStatuses.id, id));
  },

  updatePositionStmt(db: AppDatabase, id: string, position: number, now: Date) {
    return db.update(taskStatuses).set({ position, updatedAt: now }).where(eq(taskStatuses.id, id));
  },

  clearDefaultStmt(db: AppDatabase, id: string, now: Date) {
    return db
      .update(taskStatuses)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(taskStatuses.id, id), eq(taskStatuses.isDefault, true)));
  },

  setDefaultStmt(db: AppDatabase, id: string, now: Date) {
    return db
      .update(taskStatuses)
      .set({ isDefault: true, updatedAt: now })
      .where(and(eq(taskStatuses.id, id), eq(taskStatuses.isDefault, false)));
  },

  deleteStmt(db: AppDatabase, id: string) {
    // A26: delete from task_statuses where id and NOT EXISTS (SELECT 1 FROM tasks WHERE status_id = ?) and not default
    // TODO(M3-T2): add NOT EXISTS (SELECT 1 FROM tasks WHERE status_id = ?) once tasks table exists
    return db.delete(taskStatuses).where(and(eq(taskStatuses.id, id), eq(taskStatuses.isDefault, false)));
  },
};
