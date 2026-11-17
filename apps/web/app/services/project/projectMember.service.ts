import {
  auditLogRepository,
  conflictGuardStmt,
  inviteRepository,
  isVersionConflict,
  notificationRepository,
  projectMemberRepository,
  taskAssigneeRepository,
  userRepository,
  type AppDatabase,
} from "@pm/db";
import {
  canManageMembers,
  ConflictError,
  ForbiddenError,
  MemberAddSchema,
  MemberIdSchema,
  MemberInviteSchema,
  MemberRoleSchema,
  NotFoundError,
  toActor,
  UnauthorizedError,
  UserSearchSchema,
  ValidationError,
  type InviteRow,
  type MemberAddInput,
  type MemberIdInput,
  type MemberInviteInput,
  type MemberRoleInput,
  type MemberRow,
  type UserSearchInput,
} from "@pm/domain";

import { loadProjectAccess } from "../../utils/auth.server";
import type { RequestContext } from "../../utils/requestContext.server";
import { inviteService } from "../invite.service";

/**
 * Shared last-PM guard for FR-10 c5 and FR-11 c2:
 * Prevents removing or demoting the last PM in a project.
 */
export async function assertNotLastPm(db: AppDatabase, projectId: string): Promise<void> {
  const pmCount = await projectMemberRepository.countByProjectAndRole(db, projectId, "PM");
  if (pmCount <= 1) {
    throw new ValidationError("A project needs at least one PM");
  }
}

export const projectMemberService = {
  async getProjectMembers(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ members: MemberRow[]; pendingInvites: InviteRow[] }> {
    await loadProjectAccess(ctx, projectId);

    const now = ctx.clock.now();
    const [members, pendingInvites] = await Promise.all([
      projectMemberRepository.listByProjectWithUser(ctx.db, projectId),
      inviteRepository.listPendingByProject(ctx.db, projectId, now),
    ]);

    const inviteRows: InviteRow[] = pendingInvites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      projectRole: inv.projectRole ?? "MEMBER",
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));

    return {
      members,
      pendingInvites: inviteRows,
    };
  },

  async searchUsers(ctx: RequestContext, projectId: string, rawInput: UserSearchInput) {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (!canManageMembers(actor)) {
      throw new ForbiddenError("You do not have permission to manage members of this project");
    }

    const parsed = UserSearchSchema.safeParse(rawInput);
    const query = parsed.success ? parsed.data.q : "";

    return userRepository.searchActiveNonMembers(ctx.db, projectId, query);
  },

  async addMember(ctx: RequestContext, projectId: string, rawInput: MemberAddInput): Promise<{ success: true }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageMembers(actor)) {
      throw new ForbiddenError("You do not have permission to manage members of this project");
    }

    const parsed = MemberAddSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      throw new ValidationError("Invalid member data", fieldErrors);
    }

    const { userId, projectRole } = parsed.data;

    const targetUser = await userRepository.findById(ctx.db, userId);
    if (!targetUser || targetUser.status !== "ACTIVE") {
      throw new ValidationError("User not found or inactive", {
        userId: ["User not found or inactive"],
      });
    }

    const existingMember = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, userId);
    if (existingMember) {
      throw new ValidationError("Already a member", {
        userId: ["Already a member"],
      });
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();
    const notificationId = crypto.randomUUID();

    try {
      // Atomic batch A4: insert project_members; insert audit_logs MEMBER_ADDED; insert notifications PROJECT_MEMBER_ADDED
      await ctx.db.batch([
        projectMemberRepository.insertStmt(ctx.db, {
          projectId,
          userId,
          projectRole,
          createdAt: now,
        }),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "MEMBER_ADDED",
          entityType: "PROJECT_MEMBER",
          entityId: `${projectId}:${userId}`,
          projectId,
          changes: {
            userId: { from: null, to: userId },
            projectRole: { from: null, to: projectRole },
          },
          createdAt: now,
        }),
        notificationRepository.insertStmt(ctx.db, {
          id: notificationId,
          userId,
          type: "PROJECT_MEMBER_ADDED",
          entityId: projectId,
          projectId,
          payload: {
            title: `Added to project ${access.project.name}`,
            actorName: currentUser.fullName,
          },
          createdAt: now,
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("PRIMARY") || msg.includes("uq_")) {
        throw new ValidationError("Already a member", {
          userId: ["Already a member"],
        });
      }
      throw err;
    }

    ctx.logger.info("Project member added", {
      projectId,
      userId,
      projectRole,
      addedBy: currentUser.id,
    });

    return { success: true };
  },

  async removeMember(ctx: RequestContext, projectId: string, rawInput: MemberIdInput): Promise<{ success: true }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageMembers(actor)) {
      throw new ForbiddenError("You do not have permission to manage members of this project");
    }

    const parsed = MemberIdSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      throw new ValidationError("Invalid member ID", fieldErrors);
    }

    const { userId } = parsed.data;

    const member = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, userId);
    if (!member) {
      throw new NotFoundError("Member not found in project");
    }

    if (member.projectRole === "PM") {
      await assertNotLastPm(ctx.db, projectId);
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    try {
      // Atomic batch A5: delete project_members; guard; insert audit_logs MEMBER_REMOVED
      await ctx.db.batch([
        projectMemberRepository.deleteStmt(ctx.db, projectId, userId),
        conflictGuardStmt(ctx.db),
        taskAssigneeRepository.deleteByMemberOnUnarchivedTasksStmt(ctx.db, projectId, userId),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "MEMBER_REMOVED",
          entityType: "PROJECT_MEMBER",
          entityId: `${projectId}:${userId}`,
          projectId,
          changes: {
            userId: { from: userId, to: null },
            projectRole: { from: member.projectRole, to: null },
          },
          createdAt: now,
        }),
      ]);
    } catch (err) {
      if (isVersionConflict(err)) {
        throw new ConflictError("Member was modified concurrently");
      }
      throw err;
    }

    ctx.logger.info("Project member removed", {
      projectId,
      userId,
      removedBy: currentUser.id,
    });

    return { success: true };
  },

  async inviteMember(
    ctx: RequestContext,
    projectId: string,
    rawInput: MemberInviteInput,
  ): Promise<{ inviteUrl: string }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageMembers(actor)) {
      throw new ForbiddenError("You do not have permission to manage members of this project");
    }

    const parsed = MemberInviteSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      throw new ValidationError("Invalid invite data", fieldErrors);
    }

    const { email, projectRole } = parsed.data;

    const existingUser = await userRepository.findByEmail(ctx.db, email);
    if (existingUser) {
      const existingMember = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, existingUser.id);
      if (existingMember) {
        throw new ValidationError("User is already a member of this project", {
          email: ["User is already a member of this project"],
        });
      }
    }

    // Atomic batch A7 via inviteService
    const result = await inviteService.createInvite(ctx, {
      email,
      projectId,
      projectRole,
    });

    ctx.logger.info("Project invite created", {
      projectId,
      email,
      projectRole,
      invitedBy: currentUser.id,
    });

    return { inviteUrl: result.inviteUrl };
  },

  async changeRole(ctx: RequestContext, projectId: string, rawInput: MemberRoleInput): Promise<{ success: true }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const currentUser = ctx.user;

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived");
    }

    const actor = toActor(currentUser, access);
    if (!canManageMembers(actor)) {
      throw new ForbiddenError("You do not have permission to manage members of this project");
    }

    const parsed = MemberRoleSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      throw new ValidationError("Invalid role data", fieldErrors);
    }

    const { userId, projectRole } = parsed.data;

    const member = await projectMemberRepository.findByProjectAndUser(ctx.db, projectId, userId);
    if (!member) {
      throw new NotFoundError("Member not found in project");
    }

    if (member.projectRole === "PM" && projectRole !== "PM") {
      await assertNotLastPm(ctx.db, projectId);
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    try {
      // Atomic batch A6: update project_members; guard; insert audit_logs MEMBER_ROLE_CHANGED
      await ctx.db.batch([
        projectMemberRepository.updateRoleStmt(ctx.db, projectId, userId, projectRole),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: currentUser.id,
          action: "MEMBER_ROLE_CHANGED",
          entityType: "PROJECT_MEMBER",
          entityId: `${projectId}:${userId}`,
          projectId,
          changes: {
            projectRole: { from: member.projectRole, to: projectRole },
          },
          createdAt: now,
        }),
      ]);
    } catch (err) {
      if (isVersionConflict(err)) {
        throw new ConflictError("Member was modified concurrently");
      }
      throw err;
    }

    ctx.logger.info("Project member role changed", {
      projectId,
      userId,
      oldRole: member.projectRole,
      newRole: projectRole,
      changedBy: currentUser.id,
    });

    return { success: true };
  },
};
