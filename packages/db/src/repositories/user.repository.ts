import { and, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { users, type NewUser, type User } from "../schema/users";

export interface FindUserOptions {
  includeDeleted?: boolean;
}

export const userRepository = {
  async insert(db: AppDatabase, user: NewUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    if (!created) {
      throw new Error("Failed to insert user");
    }
    return created;
  },

  insertStmt(db: AppDatabase, user: NewUser) {
    return db.insert(users).values(user);
  },

  async findById(db: AppDatabase, id: string, options?: FindUserOptions): Promise<User | null> {
    const conditions = [eq(users.id, id)];
    if (!options?.includeDeleted) {
      conditions.push(isNull(users.deletedAt));
    }
    const [user] = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .limit(1);
    return user ?? null;
  },

  async findByEmail(db: AppDatabase, email: string, options?: FindUserOptions): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const conditions = [eq(users.email, normalized)];
    if (!options?.includeDeleted) {
      conditions.push(isNull(users.deletedAt));
    }
    const [user] = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .limit(1);
    return user ?? null;
  },

  async hasAdminUser(db: AppDatabase): Promise<boolean> {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.systemRole, "ADMIN"), isNull(users.deletedAt)))
      .limit(1);
    return Boolean(admin);
  },

  async updatePassword(
    db: AppDatabase,
    id: string,
    passwordHash: string,
    passwordIterations: number,
    now: Date,
  ): Promise<void> {
    await db
      .update(users)
      .set({
        passwordHash,
        passwordIterations,
        updatedAt: now,
      })
      .where(eq(users.id, id));
  },
};
