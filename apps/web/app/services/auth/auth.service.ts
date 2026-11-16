import { userRepository } from "@pm/db";
import type { SessionUser } from "@pm/domain";
import { ValidationError } from "@pm/domain";

import type { RequestContext } from "../../utils/requestContext.server";
import { hashPassword, needsRehash, verifyPassword } from "./password.server";

export interface LoginCredentials {
  email: string;
  password: string;
}

export const authService = {
  async loginWithPassword(ctx: RequestContext, credentials: LoginCredentials): Promise<SessionUser> {
    const normalizedEmail = credentials.email.trim().toLowerCase();
    const user = await userRepository.findByEmail(ctx.db, normalizedEmail, { includeDeleted: true });

    if (!user?.passwordHash || user.passwordIterations === null) {
      throw new ValidationError("Email or password is incorrect");
    }

    const isValid = await verifyPassword(credentials.password, {
      hash: user.passwordHash,
      iterations: user.passwordIterations,
    });

    if (!isValid) {
      throw new ValidationError("Email or password is incorrect");
    }

    // The account state is revealed only after the password is verified (FR-01 criterion 3).
    if (user.status === "LOCKED" || user.deletedAt !== null) {
      throw new ValidationError("This account is locked. Contact an administrator.");
    }

    if (needsRehash({ hash: user.passwordHash, iterations: user.passwordIterations })) {
      const rehashed = await hashPassword(credentials.password);
      await userRepository.updatePassword(ctx.db, user.id, rehashed.hash, rehashed.iterations, ctx.clock.now());
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
      status: user.status,
    };
  },

  async seedAdminUser(ctx: RequestContext): Promise<void> {
    const email = ctx.env.ADMIN_SEED_EMAIL;
    const password = ctx.env.ADMIN_SEED_PASSWORD;

    if (!email || !password) {
      return;
    }

    const hasAdmin = await userRepository.hasAdminUser(ctx.db);
    if (hasAdmin) {
      return;
    }

    const existing = await userRepository.findByEmail(ctx.db, email, { includeDeleted: true });
    if (existing) {
      return;
    }

    const { hash, iterations } = await hashPassword(password);
    const now = ctx.clock.now();

    await userRepository.insert(ctx.db, {
      id: crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      fullName: "System Administrator",
      systemRole: "ADMIN",
      status: "ACTIVE",
      passwordHash: hash,
      passwordIterations: iterations,
      createdAt: now,
      updatedAt: now,
    });

    ctx.logger.info("Seeded initial admin user", { email });
  },
};
