import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { ReminderKind } from "@pm/domain";

import type { AppDatabase } from "../client";
import { outboxJobs } from "../schema/outboxJobs";
import { projects } from "../schema/projects";
import { reminderLog, type ReminderLogRow } from "../schema/reminderLog";
import { taskAssignees } from "../schema/taskAssignees";
import { tasks } from "../schema/tasks";
import { taskStatuses } from "../schema/taskStatuses";
import { users } from "../schema/users";

export interface InsertReminderLogInput {
  taskId: string;
  userId: string;
  kind: ReminderKind;
  dueDate: string;
  sentAt: Date | number;
}

export interface InsertJobIfNewInput {
  id: string;
  payload: string;
  nextAttemptAt: Date | number;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface CandidateReminderTarget {
  taskId: string;
  taskTitle: string;
  dueDate: string;
  statusId: string;
  statusCategory: string;
  projectId: string;
  projectName: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  kind: ReminderKind;
}

export const reminderLogRepository = {
  insertLogStmt: (db: AppDatabase, input: InsertReminderLogInput) => {
    const sentAt = typeof input.sentAt === "number" ? new Date(input.sentAt) : input.sentAt;
    return db
      .insert(reminderLog)
      .values({
        taskId: input.taskId,
        userId: input.userId,
        kind: input.kind,
        dueDate: input.dueDate,
        sentAt,
      })
      .onConflictDoNothing();
  },

  insertJobIfNewStmt: (db: AppDatabase, job: InsertJobIfNewInput) => {
    const nextAttemptAtMs = typeof job.nextAttemptAt === "number" ? job.nextAttemptAt : job.nextAttemptAt.getTime();
    const createdAtMs = typeof job.createdAt === "number" ? job.createdAt : job.createdAt.getTime();
    const updatedAtMs = typeof job.updatedAt === "number" ? job.updatedAt : job.updatedAt.getTime();
    return db.insert(outboxJobs).select(sql`
      SELECT ${job.id}, 'EMAIL_DEADLINE_REMINDER', ${job.payload}, 'PENDING', 0, ${nextAttemptAtMs}, NULL, ${createdAtMs}, ${updatedAtMs}
      WHERE changes() = 1
    `);
  },

  findByKey: async (
    db: AppDatabase,
    taskId: string,
    userId: string,
    kind: ReminderKind,
    dueDate: string,
  ): Promise<ReminderLogRow | null> => {
    const [row] = await db
      .select()
      .from(reminderLog)
      .where(
        and(
          eq(reminderLog.taskId, taskId),
          eq(reminderLog.userId, userId),
          eq(reminderLog.kind, kind),
          eq(reminderLog.dueDate, dueDate),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  findCandidateTasks: async (
    db: AppDatabase,
    todayStr: string,
    limit: number = 100,
  ): Promise<CandidateReminderTarget[]> => {
    const rows = await db
      .select({
        taskId: tasks.id,
        taskTitle: tasks.title,
        dueDate: tasks.dueDate,
        statusId: tasks.statusId,
        statusCategory: taskStatuses.category,
        projectId: tasks.projectId,
        projectName: projects.name,
        userId: taskAssignees.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        kind: sql<ReminderKind>`CASE WHEN ${tasks.dueDate} < ${todayStr} THEN 'OVERDUE' ELSE 'DUE_SOON' END`,
      })
      .from(tasks)
      .innerJoin(projects, and(eq(tasks.projectId, projects.id), isNull(projects.deletedAt)))
      .innerJoin(taskStatuses, and(eq(tasks.statusId, taskStatuses.id), ne(taskStatuses.category, "DONE")))
      .innerJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(users, and(eq(taskAssignees.userId, users.id), isNull(users.deletedAt), eq(users.status, "ACTIVE")))
      .leftJoin(
        reminderLog,
        and(
          eq(reminderLog.taskId, tasks.id),
          eq(reminderLog.userId, taskAssignees.userId),
          eq(reminderLog.dueDate, tasks.dueDate),
          sql`${reminderLog.kind} = (CASE WHEN ${tasks.dueDate} < ${todayStr} THEN 'OVERDUE' ELSE 'DUE_SOON' END)`,
        ),
      )
      .where(
        and(
          isNull(tasks.deletedAt),
          isNotNull(tasks.dueDate),
          sql`${tasks.dueDate} <= ${todayStr}`,
          isNull(reminderLog.taskId),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      dueDate: r.dueDate ?? "",
    }));
  },
};
