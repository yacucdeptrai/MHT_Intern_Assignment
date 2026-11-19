import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { taskAssignees, type TaskAssigneeRow } from "../schema/taskAssignees";
import { tasks } from "../schema/tasks";

export const taskAssigneeRepository = {
  insertBatchStmt: (db: AppDatabase, taskId: string, userIds: string[], assignedAt: Date) => {
    return userIds.map((userId) =>
      db.insert(taskAssignees).values({
        taskId,
        userId,
        assignedAt,
      }),
    );
  },

  deleteByTaskIdStmt: (db: AppDatabase, taskId: string) => {
    return db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  },

  deleteByMemberOnUnarchivedTasksStmt: (db: AppDatabase, projectId: string, userId: string) => {
    return db.delete(taskAssignees).where(
      and(
        eq(taskAssignees.userId, userId),
        inArray(
          taskAssignees.taskId,
          db
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))),
        ),
      ),
    );
  },

  findByTaskId: async (db: AppDatabase, taskId: string): Promise<TaskAssigneeRow[]> => {
    return db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
    });
  },

  findUserIdsByTaskId: async (db: AppDatabase, taskId: string): Promise<string[]> => {
    const rows = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
      columns: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  findByTaskIdsWithUser: async (
    db: AppDatabase,
    taskIds: string[],
  ): Promise<{ taskId: string; userId: string; fullName: string; avatarKey: string | null }[]> => {
    if (taskIds.length === 0) return [];
    const { users } = await import("../schema/users");
    return db
      .select({
        taskId: taskAssignees.taskId,
        userId: users.id,
        fullName: users.fullName,
        avatarKey: users.avatarKey,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
  },

  listAssigneesByProjectId: async (
    db: AppDatabase,
    projectId: string,
  ): Promise<Array<{ taskId: string; fullName: string }>> => {
    const { users } = await import("../schema/users");
    return db
      .select({
        taskId: taskAssignees.taskId,
        fullName: users.fullName,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .orderBy(asc(users.fullName));
  },
};
