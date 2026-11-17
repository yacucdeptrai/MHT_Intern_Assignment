import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { projectMembers } from "../schema/projectMembers";
import { projects, type NewProject, type Project } from "../schema/projects";

export const projectRepository = {
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
};
