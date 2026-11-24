import {
  auditLogRepository,
  conflictGuardStmt,
  isVersionConflict,
  projectMemberRepository,
  projectRepository,
  type NewProject,
  type Project,
} from "@pm/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  UnauthorizedError,
  ValidationError,
  canManageProject,
  canViewProject,
  getProjectPermissions,
  toActor,
  type ProjectCreateInput,
  type ProjectHeaderDto,
  type ProjectPermissions,
  type ProjectSettingsDto,
  type ProjectUpdateInput,
} from "@pm/domain";

import { loadProjectAccess } from "../../utils/auth.server";
import type { RequestContext } from "../../utils/requestContext.server";

export const projectService = {
  async createProject(ctx: RequestContext, input: ProjectCreateInput): Promise<Project> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    const actor = toActor(ctx.user, null);
    if (!canManageProject(actor, "create")) {
      throw new ForbiddenError("You do not have permission to create a project", {
        key: "errors.project_create_forbidden",
      });
    }

    const parsed = ProjectCreateSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid project data", {
        key: "errors.project_invalid_data",
        fieldErrors: fieldErrors,
      });
    }

    const data = parsed.data;

    const existing = await projectRepository.findByCode(ctx.db, data.code);
    if (existing) {
      throw new ValidationError("Project code is already in use", {
        key: "errors.project_code_in_use",
        fieldErrors: {
          code: ["Project code is already in use"],
        },
      });
    }

    const projectId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const now = ctx.clock.now();

    // Batch A1: insert projects; insert project_members (creator, PM); insert audit_logs PROJECT_CREATED
    await ctx.db.batch([
      projectRepository.insertStmt(ctx.db, {
        id: projectId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        budget: data.budget ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        status: "ACTIVE",
        slackChannelId: data.slackChannelId ?? null,
        createdById: ctx.user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      projectMemberRepository.insertStmt(ctx.db, {
        projectId,
        userId: ctx.user.id,
        projectRole: "PM",
        createdAt: now,
      }),
      auditLogRepository.insertStmt(ctx.db, {
        id: auditId,
        actorId: ctx.user.id,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: projectId,
        projectId,
        changes: {
          code: { from: null, to: data.code },
          name: { from: null, to: data.name },
          description: { from: null, to: data.description },
          budget: { from: null, to: data.budget },
          startDate: { from: null, to: data.startDate },
          endDate: { from: null, to: data.endDate },
        },
        createdAt: now,
      }),
    ]);

    ctx.logger.info("Project created", {
      projectId,
      code: data.code,
      createdById: ctx.user.id,
    });

    return {
      id: projectId,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      budget: data.budget ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      status: "ACTIVE",
      slackChannelId: data.slackChannelId ?? null,
      createdById: ctx.user.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  },

  async updateProject(ctx: RequestContext, projectId: string, input: ProjectUpdateInput): Promise<Project> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived", { key: "errors.project_is_archived" });
    }

    const actor = toActor(ctx.user, access);
    if (!canManageProject(actor, "update")) {
      throw new ForbiddenError("You do not have permission to update this project", {
        key: "errors.project_update_forbidden",
      });
    }

    const parsed = ProjectUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = fieldErrors[field] ?? [];
          fieldErrors[field].push(issue.message);
        }
      }
      throw new ValidationError("Invalid project data", {
        key: "errors.project_invalid_data",
        fieldErrors: fieldErrors,
      });
    }

    const data = parsed.data;

    // Validate merged dates against existing project
    const existing = access.project;
    const effectiveStartDate = data.startDate ?? existing.startDate;
    const effectiveEndDate = data.endDate ?? existing.endDate;
    if (effectiveEndDate < effectiveStartDate) {
      throw new ValidationError("End date must be on or after start date", {
        key: "errors.end_date_order",
        fieldErrors: {
          endDate: ["End date must be on or after start date"],
        },
      });
    }

    const now = ctx.clock.now();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const patch: Partial<Omit<NewProject, "id" | "code">> = {};

    if (data.name !== undefined && data.name !== existing.name) {
      patch.name = data.name;
      changes.name = { from: existing.name, to: data.name };
    }
    if (data.description !== undefined && data.description !== existing.description) {
      patch.description = data.description;
      changes.description = { from: existing.description, to: data.description };
    }
    if (data.budget !== undefined && data.budget !== existing.budget) {
      patch.budget = data.budget;
      changes.budget = { from: existing.budget, to: data.budget };
    }
    if (data.startDate !== undefined && data.startDate !== existing.startDate) {
      patch.startDate = data.startDate;
      changes.startDate = { from: existing.startDate, to: data.startDate };
    }
    if (data.endDate !== undefined && data.endDate !== existing.endDate) {
      patch.endDate = data.endDate;
      changes.endDate = { from: existing.endDate, to: data.endDate };
    }
    if (data.status !== undefined && data.status !== existing.status) {
      patch.status = data.status;
      changes.status = { from: existing.status, to: data.status };
    }
    if (data.slackChannelId !== undefined && data.slackChannelId !== existing.slackChannelId) {
      patch.slackChannelId = data.slackChannelId;
      changes.slackChannelId = { from: existing.slackChannelId, to: data.slackChannelId };
    }

    const auditId = crypto.randomUUID();

    // Batch A2: update projects (where id, not deleted); guard; insert audit_logs PROJECT_UPDATED
    try {
      await ctx.db.batch([
        projectRepository.updateStmt(ctx.db, projectId, {
          ...patch,
          updatedAt: now,
        }),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: ctx.user.id,
          action: "PROJECT_UPDATED",
          entityType: "PROJECT",
          entityId: projectId,
          projectId,
          changes,
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Project was modified concurrently", { key: "errors.project_conflict" });
      }
      throw error;
    }

    ctx.logger.info("Project updated", {
      projectId,
      updatedBy: ctx.user.id,
      changedFields: Object.keys(changes),
    });

    return {
      ...existing,
      ...patch,
      updatedAt: now,
    };
  },

  async archiveProject(ctx: RequestContext, projectId: string): Promise<void> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    const access = await loadProjectAccess(ctx, projectId);
    if (access.isArchived) {
      throw new ForbiddenError("This project is archived", { key: "errors.project_is_archived" });
    }

    const actor = toActor(ctx.user, access);
    if (!canManageProject(actor, "archive")) {
      throw new ForbiddenError("You do not have permission to archive this project", {
        key: "errors.project_archive_forbidden",
      });
    }

    const now = ctx.clock.now();
    const auditId = crypto.randomUUID();

    // Batch A3: update projects.deleted_at; guard; insert audit_logs PROJECT_ARCHIVED
    try {
      await ctx.db.batch([
        projectRepository.archiveStmt(ctx.db, projectId, now),
        conflictGuardStmt(ctx.db),
        auditLogRepository.insertStmt(ctx.db, {
          id: auditId,
          actorId: ctx.user.id,
          action: "PROJECT_ARCHIVED",
          entityType: "PROJECT",
          entityId: projectId,
          projectId,
          changes: {
            deletedAt: { from: null, to: now.toISOString() },
          },
          createdAt: now,
        }),
      ]);
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ConflictError("Project was modified concurrently", { key: "errors.project_conflict" });
      }
      throw error;
    }

    ctx.logger.info("Project archived", {
      projectId,
      archivedBy: ctx.user.id,
    });
  },

  /** Done / total task counts for the projects list progress column. */
  async getTaskProgress(
    ctx: RequestContext,
    projectIds: string[],
  ): Promise<Record<string, { total: number; done: number }>> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }
    const rows = await projectRepository.countTaskProgress(ctx.db, projectIds);
    const progress: Record<string, { total: number; done: number }> = {};
    for (const row of rows) {
      progress[row.projectId] = { total: row.total, done: row.done };
    }
    return progress;
  },

  async listProjects(ctx: RequestContext, options?: { archivedOnly?: boolean; includeArchived?: boolean }) {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    if (ctx.user.systemRole === "ADMIN") {
      if (options?.archivedOnly) {
        return projectRepository.listArchived(ctx.db);
      }
      return projectRepository.listAll(ctx.db, options);
    }

    if (options?.archivedOnly) {
      return [];
    }

    return projectRepository.listForUser(ctx.db, ctx.user.id);
  },

  async getProjectHeader(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ project: ProjectHeaderDto; permissions: ProjectPermissions }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (!canViewProject(actor)) {
      throw new NotFoundError("Project not found", { key: "errors.project_not_found" });
    }

    const permissions = getProjectPermissions(actor);
    // Tab counts (Tasks 14, Members 5) shown in the project header.
    const [progress, members] = await Promise.all([
      projectRepository.countTaskProgress(ctx.db, [projectId]),
      projectMemberRepository.listByProject(ctx.db, projectId),
    ]);

    return {
      project: {
        id: access.project.id,
        code: access.project.code,
        name: access.project.name,
        description: access.project.description,
        status: access.project.status,
        projectRole: access.projectRole,
        isArchived: access.isArchived,
        taskCount: progress[0]?.total ?? 0,
        memberCount: members.length,
      },
      permissions,
    };
  },

  async getProjectSettings(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ project: ProjectSettingsDto; permissions: ProjectPermissions }> {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    const access = await loadProjectAccess(ctx, projectId);
    const actor = toActor(ctx.user, access);

    if (actor.systemRole !== "ADMIN" && actor.projectRole !== "PM") {
      throw new ForbiddenError("You do not have permission to view project settings", {
        key: "errors.project_settings_forbidden",
      });
    }

    const permissions = getProjectPermissions(actor);

    return {
      project: {
        id: access.project.id,
        code: access.project.code,
        name: access.project.name,
        description: access.project.description,
        budget: access.project.budget,
        startDate: access.project.startDate,
        endDate: access.project.endDate,
        status: access.project.status,
        slackChannelId: access.project.slackChannelId,
        isArchived: access.isArchived,
      },
      permissions,
    };
  },
};
