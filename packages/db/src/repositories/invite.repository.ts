import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { invites, type Invite, type NewInvite } from "../schema/invites";

export const inviteRepository = {
  insertStmt(db: AppDatabase, invite: NewInvite) {
    return db.insert(invites).values(invite);
  },

  acceptStmt(db: AppDatabase, id: string, now: Date) {
    return db
      .update(invites)
      .set({ acceptedAt: now })
      .where(and(eq(invites.id, id), isNull(invites.acceptedAt), gt(invites.expiresAt, now)));
  },

  async insert(db: AppDatabase, invite: NewInvite): Promise<Invite> {
    const [created] = await db.insert(invites).values(invite).returning();
    if (!created) {
      throw new Error("Failed to insert invite");
    }
    return created;
  },

  async findById(db: AppDatabase, id: string): Promise<Invite | null> {
    const [invite] = await db.select().from(invites).where(eq(invites.id, id)).limit(1);
    return invite ?? null;
  },

  async findByTokenHash(db: AppDatabase, tokenHash: string): Promise<Invite | null> {
    const [invite] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
    return invite ?? null;
  },

  async listPendingByProject(db: AppDatabase, projectId: string, now: Date): Promise<Invite[]> {
    return db
      .select()
      .from(invites)
      .where(and(eq(invites.projectId, projectId), isNull(invites.acceptedAt), gt(invites.expiresAt, now)))
      .orderBy(desc(invites.createdAt));
  },

  deleteExpiredBeforeStmt(db: AppDatabase, cutoff: Date) {
    return db.delete(invites).where(lt(invites.expiresAt, cutoff));
  },
};
