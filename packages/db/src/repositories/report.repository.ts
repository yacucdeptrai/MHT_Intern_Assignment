import { sql } from "drizzle-orm";
import type { MemberReportRow, OverdueByStatusItem, StaleReviewItem } from "@pm/domain";

import type { AppDatabase } from "../client";
import { projectMembers } from "../schema/projectMembers";
import { taskAssignees } from "../schema/taskAssignees";
import { tasks } from "../schema/tasks";
import { taskStatuses } from "../schema/taskStatuses";
import { users } from "../schema/users";

export interface GetMemberReportOptions {
  projectId: string;
  sprintId?: string;
  fromMs?: number;
  toMs?: number;
  todayStr: string;
}

export interface GetProjectReportDataOptions {
  projectId: string;
  todayStr: string;
  nowMs: number;
  staleThresholdMs: number;
}

export interface StatusDistributionDbRow {
  statusId: string;
  statusName: string;
  category: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  position: number;
  taskCount: number;
}

export interface ProjectReportData {
  statusDistribution: StatusDistributionDbRow[];
  overdueByStatus: OverdueByStatusItem[];
  staleReviews: StaleReviewItem[];
}

export const reportRepository = {
  getMemberReport: async (db: AppDatabase, options: GetMemberReportOptions): Promise<MemberReportRow[]> => {
    const sprintFilter = options.sprintId ? sql` AND ${tasks.sprintId} = ${options.sprintId}` : sql``;

    const fromFilter = options.fromMs !== undefined ? sql` AND ${tasks.completedAt} >= ${options.fromMs}` : sql``;

    const toFilter = options.toMs !== undefined ? sql` AND ${tasks.completedAt} <= ${options.toMs}` : sql``;

    const query = sql`
      SELECT
        ${projectMembers.userId} AS userId,
        ${users.fullName} AS fullName,
        ${users.email} AS email,
        ${users.avatarKey} AS avatarKey,
        ${projectMembers.projectRole} AS projectRole,
        CAST(COUNT(CASE WHEN ${taskStatuses.category} = 'TODO' THEN 1 END) AS INTEGER) AS todoCount,
        CAST(COUNT(CASE WHEN ${taskStatuses.category} = 'IN_PROGRESS' THEN 1 END) AS INTEGER) AS inProgressCount,
        CAST(COUNT(CASE WHEN ${taskStatuses.category} = 'REVIEW' THEN 1 END) AS INTEGER) AS reviewCount,
        CAST(COUNT(CASE WHEN ${taskStatuses.category} = 'DONE' THEN 1 END) AS INTEGER) AS doneCount,
        CAST(COUNT(${tasks.id}) AS INTEGER) AS totalAssigned,
        CAST(COUNT(CASE WHEN ${taskStatuses.category} != 'DONE' AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${options.todayStr} THEN 1 END) AS INTEGER) AS overdueCount,
        CAST(COUNT(CASE WHEN ${tasks.completedAt} IS NOT NULL ${fromFilter} ${toFilter} THEN 1 END) AS INTEGER) AS completedInRangeCount
      FROM ${projectMembers}
      INNER JOIN ${users} ON ${users.id} = ${projectMembers.userId}
      LEFT JOIN ${taskAssignees} ON ${taskAssignees.userId} = ${projectMembers.userId}
      LEFT JOIN ${tasks} ON ${tasks.id} = ${taskAssignees.taskId}
        AND ${tasks.projectId} = ${options.projectId}
        AND ${tasks.deletedAt} IS NULL
        ${sprintFilter}
      LEFT JOIN ${taskStatuses} ON ${taskStatuses.id} = ${tasks.statusId}
      WHERE ${projectMembers.projectId} = ${options.projectId}
      GROUP BY ${projectMembers.userId}, ${users.fullName}, ${users.email}, ${users.avatarKey}, ${projectMembers.projectRole}
      ORDER BY
        CASE ${projectMembers.projectRole}
          WHEN 'PM' THEN 1
          WHEN 'TEAM_LEAD' THEN 2
          ELSE 3
        END,
        ${users.fullName} ASC
    `;

    return db.all<MemberReportRow>(query);
  },

  getProjectReportData: async (db: AppDatabase, options: GetProjectReportDataOptions): Promise<ProjectReportData> => {
    // 1. Status distribution
    const distQuery = sql`
      SELECT
        ${taskStatuses.id} AS statusId,
        ${taskStatuses.name} AS statusName,
        ${taskStatuses.category} AS category,
        ${taskStatuses.position} AS position,
        CAST(COUNT(${tasks.id}) AS INTEGER) AS taskCount
      FROM ${taskStatuses}
      LEFT JOIN ${tasks} ON ${tasks.statusId} = ${taskStatuses.id}
        AND ${tasks.projectId} = ${options.projectId}
        AND ${tasks.deletedAt} IS NULL
      GROUP BY ${taskStatuses.id}, ${taskStatuses.name}, ${taskStatuses.category}, ${taskStatuses.position}
      ORDER BY ${taskStatuses.position} ASC
    `;
    const statusDistribution = await db.all<StatusDistributionDbRow>(distQuery);

    // 2. Overdue by status (category != DONE)
    const overdueQuery = sql`
      SELECT
        ${taskStatuses.id} AS statusId,
        ${taskStatuses.name} AS statusName,
        ${taskStatuses.category} AS category,
        CAST(COUNT(${tasks.id}) AS INTEGER) AS overdueCount
      FROM ${taskStatuses}
      INNER JOIN ${tasks} ON ${tasks.statusId} = ${taskStatuses.id}
        AND ${tasks.projectId} = ${options.projectId}
        AND ${tasks.deletedAt} IS NULL
        AND ${tasks.dueDate} IS NOT NULL
        AND ${tasks.dueDate} < ${options.todayStr}
      WHERE ${taskStatuses.category} != 'DONE'
      GROUP BY ${taskStatuses.id}, ${taskStatuses.name}, ${taskStatuses.category}
      HAVING COUNT(${tasks.id}) > 0
      ORDER BY overdueCount DESC, ${taskStatuses.name} ASC
    `;
    const overdueByStatus = await db.all<OverdueByStatusItem>(overdueQuery);

    // 3. Stale reviews (REVIEW category and statusChangedAt <= staleThresholdMs)
    interface StaleReviewDbRow {
      taskId: string;
      taskNumber: number;
      title: string;
      statusId: string;
      statusName: string;
      statusChangedAt: number;
      daysInReview: number;
    }

    const staleQuery = sql`
      SELECT
        ${tasks.id} AS taskId,
        ${tasks.number} AS taskNumber,
        ${tasks.title} AS title,
        ${taskStatuses.id} AS statusId,
        ${taskStatuses.name} AS statusName,
        ${tasks.statusChangedAt} AS statusChangedAt,
        CAST(((${options.nowMs} - ${tasks.statusChangedAt}) / 86400000) AS INTEGER) AS daysInReview
      FROM ${tasks}
      INNER JOIN ${taskStatuses} ON ${taskStatuses.id} = ${tasks.statusId}
        AND ${taskStatuses.category} = 'REVIEW'
      WHERE ${tasks.projectId} = ${options.projectId}
        AND ${tasks.deletedAt} IS NULL
        AND ${tasks.statusChangedAt} <= ${options.staleThresholdMs}
      ORDER BY ${tasks.statusChangedAt} ASC
    `;
    const staleRows = await db.all<StaleReviewDbRow>(staleQuery);

    let staleReviews: StaleReviewItem[] = [];
    if (staleRows.length > 0) {
      const taskIds = staleRows.map((r) => r.taskId);
      interface AssigneeRow {
        taskId: string;
        id: string;
        fullName: string;
        email: string;
        avatarKey: string | null;
      }
      const assigneesQuery = sql`
        SELECT
          ${taskAssignees.taskId} AS taskId,
          ${users.id} AS id,
          ${users.fullName} AS fullName,
          ${users.email} AS email,
          ${users.avatarKey} AS avatarKey
        FROM ${taskAssignees}
        INNER JOIN ${users} ON ${users.id} = ${taskAssignees.userId}
        WHERE ${taskAssignees.taskId} IN (${sql.join(
          taskIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        ORDER BY ${users.fullName} ASC
      `;
      const assigneeRows = await db.all<AssigneeRow>(assigneesQuery);
      const assigneesByTask = new Map<string, AssigneeRow[]>();
      for (const row of assigneeRows) {
        const list = assigneesByTask.get(row.taskId) ?? [];
        list.push(row);
        assigneesByTask.set(row.taskId, list);
      }

      staleReviews = staleRows.map((r) => ({
        taskId: r.taskId,
        taskNumber: r.taskNumber,
        title: r.title,
        statusId: r.statusId,
        statusName: r.statusName,
        statusChangedAt: new Date(r.statusChangedAt),
        daysInReview: r.daysInReview,
        assignees: (assigneesByTask.get(r.taskId) ?? []).map((a) => ({
          id: a.id,
          fullName: a.fullName,
          email: a.email,
          avatarKey: a.avatarKey,
        })),
      }));
    }

    return {
      statusDistribution,
      overdueByStatus,
      staleReviews,
    };
  },
};
