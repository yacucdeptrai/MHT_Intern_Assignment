import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { StatusCategory, TaskPriority } from "@pm/domain";

import type { AppDatabase } from "../client";
import { projects } from "../schema/projects";
import { sprints } from "../schema/sprints";
import { taskAssignees } from "../schema/taskAssignees";
import { tasks, type TaskRow } from "../schema/tasks";
import { taskStatuses } from "../schema/taskStatuses";

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

export interface ListProjectTasksFilter {
  projectId: string;
  statusId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  sprintId?: string;
  page?: number;
  pageSize?: number;
}

export interface TaskWithMetaRow extends TaskRow {
  statusName: string;
  statusCategory: StatusCategory;
  sprintName: string | null;
}

export interface MyTaskRow extends TaskWithMetaRow {
  projectCode: string;
  projectName: string;
}

export interface ListMyTasksFilter {
  userId: string;
  allowedProjectIds?: string[];
  projectId?: string;
  statusId?: string;
  priority?: TaskPriority;
  dueRange?: "all" | "overdue" | "today" | "week";
  todayStr?: string;
  endOfWeekStr?: string;
  page?: number;
  pageSize?: number;
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

  listProjectTasks: async (
    db: AppDatabase,
    filter: ListProjectTasksFilter,
  ): Promise<{ items: TaskWithMetaRow[]; total: number; page: number; pageSize: number; totalPages: number }> => {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;
    const conditions = [eq(tasks.projectId, filter.projectId), isNull(tasks.deletedAt)];

    if (filter.statusId) {
      conditions.push(eq(tasks.statusId, filter.statusId));
    }
    if (filter.priority) {
      conditions.push(eq(tasks.priority, filter.priority));
    }
    if (filter.sprintId) {
      conditions.push(eq(tasks.sprintId, filter.sprintId));
    }
    if (filter.assigneeId) {
      conditions.push(
        inArray(
          tasks.id,
          db
            .select({ taskId: taskAssignees.taskId })
            .from(taskAssignees)
            .where(eq(taskAssignees.userId, filter.assigneeId)),
        ),
      );
    }

    const whereClause = and(...conditions);

    const [items, countResult] = await db.batch([
      db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          number: tasks.number,
          parentTaskId: tasks.parentTaskId,
          sprintId: tasks.sprintId,
          statusId: tasks.statusId,
          title: tasks.title,
          description: tasks.description,
          priority: tasks.priority,
          startDate: tasks.startDate,
          dueDate: tasks.dueDate,
          createdById: tasks.createdById,
          slackThreadTs: tasks.slackThreadTs,
          statusChangedAt: tasks.statusChangedAt,
          completedAt: tasks.completedAt,
          version: tasks.version,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          deletedAt: tasks.deletedAt,
          statusName: taskStatuses.name,
          statusCategory: taskStatuses.category,
          sprintName: sprints.name,
        })
        .from(tasks)
        .innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(whereClause)
        .orderBy(asc(tasks.number))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)` })
        .from(tasks)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  listMyTasks: async (
    db: AppDatabase,
    filter: ListMyTasksFilter,
  ): Promise<{ items: MyTaskRow[]; total: number; page: number; pageSize: number; totalPages: number }> => {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;

    const assignedSubquery = db
      .select({ taskId: taskAssignees.taskId })
      .from(taskAssignees)
      .where(eq(taskAssignees.userId, filter.userId));

    const conditions = [inArray(tasks.id, assignedSubquery), isNull(tasks.deletedAt), isNull(projects.deletedAt)];

    if (filter.allowedProjectIds) {
      if (filter.allowedProjectIds.length === 0) {
        return { items: [], total: 0, page, pageSize, totalPages: 1 };
      }
      conditions.push(inArray(tasks.projectId, filter.allowedProjectIds));
    }

    if (filter.projectId) {
      conditions.push(eq(tasks.projectId, filter.projectId));
    }
    if (filter.statusId) {
      conditions.push(eq(tasks.statusId, filter.statusId));
    }
    if (filter.priority) {
      conditions.push(eq(tasks.priority, filter.priority));
    }

    if (filter.dueRange === "overdue" && filter.todayStr) {
      conditions.push(
        isNotNull(tasks.dueDate),
        sql`${tasks.dueDate} < ${filter.todayStr}`,
        sql`${taskStatuses.category} != 'DONE'`,
      );
    } else if (filter.dueRange === "today" && filter.todayStr) {
      conditions.push(eq(tasks.dueDate, filter.todayStr));
    } else if (filter.dueRange === "week" && filter.todayStr && filter.endOfWeekStr) {
      conditions.push(
        isNotNull(tasks.dueDate),
        sql`${tasks.dueDate} >= ${filter.todayStr}`,
        sql`${tasks.dueDate} <= ${filter.endOfWeekStr}`,
      );
    }

    const whereClause = and(...conditions);

    const [items, countResult] = await db.batch([
      db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          number: tasks.number,
          parentTaskId: tasks.parentTaskId,
          sprintId: tasks.sprintId,
          statusId: tasks.statusId,
          title: tasks.title,
          description: tasks.description,
          priority: tasks.priority,
          startDate: tasks.startDate,
          dueDate: tasks.dueDate,
          createdById: tasks.createdById,
          slackThreadTs: tasks.slackThreadTs,
          statusChangedAt: tasks.statusChangedAt,
          completedAt: tasks.completedAt,
          version: tasks.version,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          deletedAt: tasks.deletedAt,
          statusName: taskStatuses.name,
          statusCategory: taskStatuses.category,
          projectCode: projects.code,
          projectName: projects.name,
          sprintName: sprints.name,
        })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(whereClause)
        .orderBy(asc(tasks.dueDate), desc(tasks.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)` })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },
};
