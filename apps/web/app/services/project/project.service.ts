import { auditLogRepository, projectMemberRepository, projectRepository, type Project } from "@pm/db";
import {
  ForbiddenError,
  NotFoundError,
  ProjectCreateSchema,
  UnauthorizedError,
  ValidationError,
  canManageProject,
  canViewProject,
  getProjectPermissions,
  toActor,
  type ProjectCreateInput,
  type ProjectHeaderDto,
  type ProjectPermissions,
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
      throw new ForbiddenError("You do not have permission to create a project");
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
      throw new ValidationError("Invalid project data", fieldErrors);
    }

    const data = parsed.data;

    const existing = await projectRepository.findByCode(ctx.db, data.code);
    if (existing) {
      throw new ValidationError("Project code is already in use", {
        code: ["Project code is already in use"],
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

  async listProjects(ctx: RequestContext) {
    if (!ctx.user) {
      throw new UnauthorizedError();
    }

    if (ctx.user.systemRole === "ADMIN") {
      return projectRepository.listAll(ctx.db);
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
      throw new NotFoundError("Project not found");
    }

    const permissions = getProjectPermissions(actor);

    return {
      project: {
        id: access.project.id,
        code: access.project.code,
        name: access.project.name,
        description: access.project.description,
        status: access.project.status,
        projectRole: access.projectRole,
        isArchived: access.isArchived,
      },
      permissions,
    };
  },
};
