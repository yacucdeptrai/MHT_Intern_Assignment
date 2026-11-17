import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { sprints, type NewSprintRow, type SprintRow } from "../schema/sprints";
import { tasks } from "../schema/tasks";
import { taskStatuses } from "../schema/taskStatuses";

export interface SprintWithStatsRow {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  taskCount: number;
  completedCount: number;
}

export const sprintRepository = {
  insert: async (db: AppDatabase, row: NewSprintRow): Promise<SprintRow> => {
    const inserted = await db.insert(sprints).values(row).returning();
    if (!inserted[0]) {
      throw new Error("Failed to insert sprint");
    }
    return inserted[0];
  },

  insertStmt: (db: AppDatabase, row: NewSprintRow) => {
    return db.insert(sprints).values(row);
  },

  updateStmt: (
    db: AppDatabase,
    input: {
      id: string;
      name?: string;
      startDate?: string;
      endDate?: string;
      now: Date;
    },
  ) => {
    const setValues: Partial<NewSprintRow> = {
      updatedAt: input.now,
    };
    if (input.name !== undefined) setValues.name = input.name;
    if (input.startDate !== undefined) setValues.startDate = input.startDate;
    if (input.endDate !== undefined) setValues.endDate = input.endDate;

    return db
      .update(sprints)
      .set(setValues)
      .where(and(eq(sprints.id, input.id), isNull(sprints.deletedAt)));
  },

  archiveStmt: (db: AppDatabase, id: string, now: Date) => {
    return db
      .update(sprints)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(sprints.id, id), isNull(sprints.deletedAt)));
  },

  findById: async (db: AppDatabase, id: string): Promise<SprintRow | undefined> => {
    return db.query.sprints.findFirst({
      where: and(eq(sprints.id, id), isNull(sprints.deletedAt)),
    });
  },

  findByIdIncludingArchived: async (db: AppDatabase, id: string): Promise<SprintRow | undefined> => {
    return db.query.sprints.findFirst({
      where: eq(sprints.id, id),
    });
  },

  listByProject: async (db: AppDatabase, projectId: string): Promise<SprintRow[]> => {
    return db.query.sprints.findMany({
      where: and(eq(sprints.projectId, projectId), isNull(sprints.deletedAt)),
      orderBy: (table, { asc: ascOrder }) => [ascOrder(table.startDate)],
    });
  },

  listByProjectWithStats: async (db: AppDatabase, projectId: string): Promise<SprintWithStatsRow[]> => {
    return db
      .select({
        id: sprints.id,
        projectId: sprints.projectId,
        name: sprints.name,
        startDate: sprints.startDate,
        endDate: sprints.endDate,
        createdAt: sprints.createdAt,
        updatedAt: sprints.updatedAt,
        deletedAt: sprints.deletedAt,
        taskCount: sql<number>`cast(count(${tasks.id}) as integer)`.mapWith(Number),
        completedCount:
          sql<number>`cast(count(case when ${taskStatuses.category} = 'DONE' then 1 else null end) as integer)`.mapWith(
            Number,
          ),
      })
      .from(sprints)
      .leftJoin(tasks, and(eq(tasks.sprintId, sprints.id), isNull(tasks.parentTaskId), isNull(tasks.deletedAt)))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(and(eq(sprints.projectId, projectId), isNull(sprints.deletedAt)))
      .groupBy(sprints.id)
      .orderBy(asc(sprints.startDate), asc(sprints.createdAt));
  },
};
