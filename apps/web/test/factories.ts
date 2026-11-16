import type { AppDatabase, NewUser, User } from "@pm/db";
import { userRepository } from "@pm/db";

import { hashPassword } from "../app/services/auth/password.server";

export async function createUser(db: AppDatabase, overrides?: Partial<NewUser> & { password?: string }): Promise<User> {
  const now = new Date();
  const id = overrides?.id ?? crypto.randomUUID();
  const password = overrides?.password ?? "Password123!";
  const { hash, iterations } = await hashPassword(password);

  const newUser: NewUser = {
    id,
    email: overrides?.email ?? `user-${id.slice(0, 8)}@example.com`,
    fullName: overrides?.fullName ?? "Test User",
    systemRole: overrides?.systemRole ?? "MEMBER",
    status: overrides?.status ?? "ACTIVE",
    passwordHash: overrides?.passwordHash !== undefined ? overrides.passwordHash : hash,
    passwordIterations: overrides?.passwordIterations !== undefined ? overrides.passwordIterations : iterations,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    deletedAt: overrides?.deletedAt ?? null,
  };

  return userRepository.insert(db, newUser);
}
