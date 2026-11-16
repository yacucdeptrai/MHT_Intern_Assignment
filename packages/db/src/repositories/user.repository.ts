import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";

import type { Page, SystemRole, UserStatus } from "@pm/domain";

import type { AppDatabase } from "../client";
import { users, type NewUser, type User } from "../schema/users";

export interface FindUserOptions {
  includeDeleted?: boolean;
}

export interface ListUsersOptions {
  q?: string;
  status?: UserStatus;
  systemRole?: SystemRole;
  page?: number;
  pageSize?: number;
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

  updateStmt(db: AppDatabase, id: string, data: Partial<NewUser>) {
    return db
      .update(users)
      .set(data)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
  },

  setStatusStmt(db: AppDatabase, id: string, status: UserStatus, now: Date) {
    return db
      .update(users)
      .set({ status, updatedAt: now })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
  },

  setSystemRoleStmt(db: AppDatabase, id: string, systemRole: SystemRole, now: Date) {
    return db
      .update(users)
      .set({ systemRole, updatedAt: now })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
  },

  softDeleteStmt(db: AppDatabase, id: string, now: Date) {
    return db
      .update(users)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
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

  async countAdmins(db: AppDatabase): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.systemRole, "ADMIN"), isNull(users.deletedAt)));
    return Number(result?.count ?? 0);
  },

  async listUsers(db: AppDatabase, options?: ListUsersOptions): Promise<Page<User>> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, options?.pageSize ?? 50);
    const conditions = [isNull(users.deletedAt)];

    if (options?.status) {
      conditions.push(eq(users.status, options.status));
    }
    if (options?.systemRole) {
      conditions.push(eq(users.systemRole, options.systemRole));
    }
    if (options?.q) {
      const searchPattern = `%${options.q.trim()}%`;
      const searchCondition = or(like(users.fullName, searchPattern), like(users.email, searchPattern));
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const [items, countResult] = await db.batch([
      db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult?.[0]?.total ?? 0);
    return {
      items: items ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
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
