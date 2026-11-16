import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { projectMembers, type NewProjectMember, type ProjectMember } from "../schema/projectMembers";

export const projectMemberRepository = {
  insertStmt(db: AppDatabase, member: NewProjectMember) {
    return db.insert(projectMembers).values(member);
  },

  async findByProjectAndUser(db: AppDatabase, projectId: string, userId: string): Promise<ProjectMember | null> {
    const result = await db.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });
    return result ?? null;
  },

  async listByProject(db: AppDatabase, projectId: string): Promise<ProjectMember[]> {
    return db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
  },

  async listByUser(db: AppDatabase, userId: string): Promise<ProjectMember[]> {
    return db.select().from(projectMembers).where(eq(projectMembers.userId, userId));
  },
};
