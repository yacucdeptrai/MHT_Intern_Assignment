import type { AppDatabase } from "@pm/db";
import {
  conflictGuardStmt,
  inviteRepository,
  outboxJobRepository,
  projectMemberRepository,
  userRepository,
} from "@pm/db";
import type { CreateInviteInput, SessionUser } from "@pm/domain";
import { TOKEN_INVITE_EXPIRY_MS, ValidationError } from "@pm/domain";

import { sealInviteToken } from "../utils/crypto.server";
import type { RequestContext } from "../utils/requestContext.server";
import { hashPassword } from "./auth/password.server";
import { dispatchOutbox } from "./outbox.service";

export interface ValidateTokenResult {
  status: "valid" | "invalid";
  email?: string;
  projectId?: string | null;
  projectName?: string;
}

export interface CreateInviteResult {
  inviteId: string;
  inviteToken: string;
  inviteUrl: string;
}

async function hashTokenHex(tokenHex: string): Promise<string> {
  const bytes = new Uint8Array(tokenHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const inviteService = {
  async createInvite(ctx: RequestContext, input: CreateInviteInput): Promise<CreateInviteResult> {
    const email = input.email.trim().toLowerCase();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const tokenHex = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const digest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

    const now = ctx.clock.now();
    const expiresAt = new Date(now.getTime() + TOKEN_INVITE_EXPIRY_MS);
    const inviteId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    const sealedToken = await sealInviteToken(tokenHex, ctx.env.SESSION_SECRET);

    // Atomic batch A7: insert invites; insert outbox_jobs EMAIL_INVITE
    await ctx.db.batch([
      inviteRepository.insertStmt(ctx.db, {
        id: inviteId,
        email,
        tokenHash,
        userId: null,
        projectId: input.projectId ?? null,
        projectRole: input.projectRole ?? null,
        invitedById: ctx.user?.id ?? "system",
        expiresAt,
        createdAt: now,
      }),
      outboxJobRepository.insertStmt(ctx.db, {
        id: jobId,
        type: "EMAIL_INVITE",
        payload: JSON.stringify({ inviteId, sealedToken }),
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    // Dispatch outbox job in background
    ctx.waitUntil(dispatchOutbox(ctx, [jobId]));

    const inviteUrl = `${ctx.env.APP_BASE_URL.replace(/\/+$/, "")}/invite/${tokenHex}`;
    return {
      inviteId,
      inviteToken: tokenHex,
      inviteUrl,
    };
  },

  async validateToken(
    ctx: { db: AppDatabase; clock: { now: () => Date } },
    rawToken: string,
  ): Promise<ValidateTokenResult> {
    if (!rawToken || rawToken.trim().length === 0) {
      return { status: "invalid" };
    }

    try {
      const tokenHash = await hashTokenHex(rawToken.trim());
      const invite = await inviteRepository.findByTokenHash(ctx.db, tokenHash);
      const now = ctx.clock.now();

      if (!invite || invite.acceptedAt !== null || invite.expiresAt <= now) {
        return { status: "invalid" };
      }

      return {
        status: "valid",
        email: invite.email,
        projectId: invite.projectId,
      };
    } catch {
      return { status: "invalid" };
    }
  },

  async acceptInvite(ctx: RequestContext, rawToken: string, password: string): Promise<SessionUser> {
    const tokenHash = await hashTokenHex(rawToken.trim());
    const invite = await inviteRepository.findByTokenHash(ctx.db, tokenHash);
    const now = ctx.clock.now();

    if (!invite || invite.acceptedAt !== null || invite.expiresAt <= now) {
      throw new ValidationError("This invite is invalid or has expired");
    }

    const { hash, iterations } = await hashPassword(password);
    const existingUser = await userRepository.findByEmail(ctx.db, invite.email, { includeDeleted: true });

    let userId: string;
    let fullName: string;
    let systemRole: "MEMBER" | "TEAM_LEAD" | "PM" | "ADMIN" = "MEMBER";

    if (existingUser) {
      userId = existingUser.id;
      fullName = existingUser.fullName;
      systemRole = existingUser.systemRole;
    } else {
      userId = crypto.randomUUID();
      fullName = invite.email.split("@")[0] ?? "New User";
    }

    const userMutation = existingUser
      ? userRepository.updateStmt(ctx.db, existingUser.id, {
          passwordHash: hash,
          passwordIterations: iterations,
          status: "ACTIVE",
          updatedAt: now,
        })
      : userRepository.insertStmt(ctx.db, {
          id: userId,
          email: invite.email,
          fullName,
          systemRole: "MEMBER",
          status: "ACTIVE",
          passwordHash: hash,
          passwordIterations: iterations,
          createdAt: now,
          updatedAt: now,
        });

    // Execute atomic batch A8: accept invite, version guard, create/update user, optional project_member
    const batchStmts = [inviteRepository.acceptStmt(ctx.db, invite.id, now), conflictGuardStmt(ctx.db), userMutation];

    if (invite.projectId && invite.projectRole) {
      batchStmts.push(
        projectMemberRepository.insertStmt(ctx.db, {
          projectId: invite.projectId,
          userId,
          projectRole: invite.projectRole,
          createdAt: now,
        }),
      );
    }

    await ctx.db.batch(batchStmts as [(typeof batchStmts)[0], ...typeof batchStmts]);

    return {
      id: userId,
      email: invite.email,
      fullName,
      systemRole,
      status: "ACTIVE",
    };
  },
};
