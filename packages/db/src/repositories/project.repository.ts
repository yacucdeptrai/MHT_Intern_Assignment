import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { ProjectRiskItem } from "@pm/domain";

import { chunk } from "../chunk";
import type { AppDatabase } from "../client";
import { projectMembers } from "../schema/projectMembers";
import { projects, type NewProject, type Project } from "../schema/projects";
import { tasks } from "../schema/tasks";
import { taskStatuses } from "../schema/taskStatuses";

export const projectRepository = {
  /** Live task totals and DONE-category counts per project (projects list progress bar). */
  async countTaskProgress(
    db: AppDatabase,
    projectIds: string[],
  ): Promise<Array<{ projectId: string; total: number; done: number }>> {
    if (projectIds.length === 0) {
      return [];
    }
    const results = await Promise.all(
      chunk(projectIds).map((ids) =>
        db
          .select({
            projectId: tasks.projectId,
            total: sql<number>`count(${tasks.id})`.mapWith(Number),
            done: sql<number>`sum(case when ${taskStatuses.category} = 'DONE' then 1 else 0 end)`.mapWith(Number),
          })
          .from(tasks)
          .innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
          .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt)))
          .groupBy(tasks.projectId),
      ),
    );
    return results.flat();
  },

  insertStmt(db: AppDatabase, project: NewProject) {
    return db.insert(projects).values(project);
  },

  updateStmt(db: AppDatabase, id: string, patch: Partial<Omit<NewProject, "id" | "code">>) {
    return db
      .update(projects)
      .set(patch)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  },

  archiveStmt(db: AppDatabase, id: string, deletedAt: Date = new Date()) {
    return db
      .update(projects)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  },

  async findById(db: AppDatabase, id: string): Promise<Project | null> {
    const result = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    });
    return result ?? null;
  },

  async findByIdIncludingArchived(db: AppDatabase, id: string): Promise<Project | null> {
    const result = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    return result ?? null;
  },

  async findByCode(db: AppDatabase, code: string): Promise<Project | null> {
    const upperCode = code.toUpperCase();
    const [result] = await db
      .select()
      .from(projects)
      .where(sql`UPPER(${projects.code}) = ${upperCode}`)
      .limit(1);
    return result ?? null;
  },

  async listAll(db: AppDatabase, options?: { includeArchived?: boolean }): Promise<Project[]> {
    if (options?.includeArchived) {
      return db.select().from(projects).orderBy(desc(projects.createdAt));
    }
    return db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(desc(projects.createdAt));
  },

  async listArchived(db: AppDatabase): Promise<Project[]> {
    return db.select().from(projects).where(isNotNull(projects.deletedAt)).orderBy(desc(projects.deletedAt));
  },

  async listForUser(db: AppDatabase, userId: string): Promise<Array<Project & { projectRole: string }>> {
    const rows = await db
      .select({
        project: projects,
        projectRole: projectMembers.projectRole,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.createdAt));

    return rows.map((r) => ({
      ...r.project,
      projectRole: r.projectRole,
    }));
  },

  async listProjectsAtRisk(
    db: AppDatabase,
    options: { todayStr: string; allowedProjectIds?: string[] },
  ): Promise<ProjectRiskItem[]> {
    if (options.allowedProjectIds && options.allowedProjectIds.length === 0) {
      return [];
    }

    const conditions = [
      isNull(projects.deletedAt),
      isNull(tasks.deletedAt),
      isNotNull(tasks.dueDate),
      sql`${tasks.dueDate} < ${options.todayStr}`,
      sql`${taskStatuses.category} != 'DONE'`,
    ];

    if (options.allowedProjectIds) {
      conditions.push(inArray(projects.id, options.allowedProjectIds));
    }

    const rows = await db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        overdueCount: sql<number>`count(${tasks.id})`.mapWith(Number),
      })
      .from(projects)
      .innerJoin(tasks, eq(tasks.projectId, projects.id))
      .innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(and(...conditions))
      .groupBy(projects.id, projects.code, projects.name)
      .having(sql`count(${tasks.id}) > 0`)
      .orderBy(desc(sql`count(${tasks.id})`), asc(projects.code));

    return rows;
  },
};
