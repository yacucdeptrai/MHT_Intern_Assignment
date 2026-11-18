import { sql } from "drizzle-orm";
import type { MemberReportRow } from "@pm/domain";

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
};
