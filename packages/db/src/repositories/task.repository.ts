import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { TaskPriority } from "@pm/domain";

import type { AppDatabase } from "../client";
import { tasks, type TaskRow } from "../schema/tasks";

export interface CreateTaskInput {
  id: string;
  projectId: string;
  parentTaskId?: string | null;
  sprintId?: string | null;
  statusId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  createdById: string;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const taskRepository = {
  insertStmt: (db: AppDatabase, input: CreateTaskInput) => {
    return db.insert(tasks).values({
      id: input.id,
      projectId: input.projectId,
      number: sql`(SELECT COALESCE(MAX(number), 0) + 1 FROM tasks WHERE project_id = ${input.projectId})`,
      parentTaskId: input.parentTaskId ?? null,
      sprintId: input.sprintId ?? null,
      statusId: input.statusId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "MEDIUM",
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      createdById: input.createdById,
      slackThreadTs: null,
      statusChangedAt: input.statusChangedAt,
      completedAt: null,
      version: 1,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      deletedAt: null,
    });
  },

  archiveStmt: (db: AppDatabase, id: string, deletedAt: Date = new Date()) => {
    return db
      .update(tasks)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  },

  findById: async (db: AppDatabase, id: string): Promise<TaskRow | undefined> => {
    return db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), isNull(tasks.deletedAt)),
    });
  },

  findByIdIncludingArchived: async (db: AppDatabase, id: string): Promise<TaskRow | undefined> => {
    return db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });
  },

  findByProjectAndNumber: async (db: AppDatabase, projectId: string, number: number): Promise<TaskRow | undefined> => {
    return db.query.tasks.findFirst({
      where: and(eq(tasks.projectId, projectId), eq(tasks.number, number), isNull(tasks.deletedAt)),
    });
  },

  countByStatusId: async (db: AppDatabase, statusId: string): Promise<number> => {
    const result = await db.select({ count: count() }).from(tasks).where(eq(tasks.statusId, statusId));
    return result[0]?.count ?? 0;
  },

  listByProject: async (db: AppDatabase, projectId: string): Promise<TaskRow[]> => {
    return db.query.tasks.findMany({
      where: and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)),
      orderBy: (table, { asc }) => [asc(table.number)],
    });
  },
};
