import { and, asc, count, eq, inArray } from "drizzle-orm";

import type { MemberRow, ProjectRole } from "@pm/domain";

import { chunk } from "../chunk";
import type { AppDatabase } from "../client";
import { projectMembers, type NewProjectMember, type ProjectMember } from "../schema/projectMembers";
import { users } from "../schema/users";

export const projectMemberRepository = {
  insertStmt(db: AppDatabase, member: NewProjectMember) {
    return db.insert(projectMembers).values(member);
  },

  deleteStmt(db: AppDatabase, projectId: string, userId: string) {
    return db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  },

  updateRoleStmt(db: AppDatabase, projectId: string, userId: string, projectRole: ProjectRole) {
    return db
      .update(projectMembers)
      .set({ projectRole })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  },

  async findByProjectAndUser(db: AppDatabase, projectId: string, userId: string): Promise<ProjectMember | null> {
    const result = await db.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });
    return result ?? null;
  },

  async countByProjectAndRole(db: AppDatabase, projectId: string, role: ProjectRole): Promise<number> {
    const [row] = await db
      .select({ count: count() })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.projectRole, role)));
    return row?.count ?? 0;
  },

  async listByProject(db: AppDatabase, projectId: string): Promise<ProjectMember[]> {
    return db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
  },

  async listByProjectWithUser(db: AppDatabase, projectId: string): Promise<MemberRow[]> {
    const rows = await db
      .select({
        userId: projectMembers.userId,
        fullName: users.fullName,
        email: users.email,
        avatarKey: users.avatarKey,
        projectRole: projectMembers.projectRole,
        createdAt: projectMembers.createdAt,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.fullName));

    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      avatarKey: r.avatarKey,
      projectRole: r.projectRole,
      createdAt: r.createdAt,
    }));
  },

  async listByUser(db: AppDatabase, userId: string): Promise<ProjectMember[]> {
    return db.select().from(projectMembers).where(eq(projectMembers.userId, userId));
  },

  /** Project managers of the given projects, ordered by name (dashboard "Projects at risk" PM column). */
  async listPmNamesByProjects(
    db: AppDatabase,
    projectIds: string[],
  ): Promise<Array<{ projectId: string; fullName: string }>> {
    if (projectIds.length === 0) {
      return [];
    }
    const results = await Promise.all(
      chunk(projectIds).map((ids) =>
        db
          .select({ projectId: projectMembers.projectId, fullName: users.fullName })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(and(inArray(projectMembers.projectId, ids), eq(projectMembers.projectRole, "PM")))
          .orderBy(asc(users.fullName)),
      ),
    );
    return results.flat().sort((a, b) => a.fullName.localeCompare(b.fullName));
  },
};
