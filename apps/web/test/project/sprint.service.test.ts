import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  auditLogRepository,
  createDatabase,
  projectMemberRepository,
  projectRepository,
  sprintRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
} from "@pm/db";
import { ForbiddenError, NotFoundError, ValidationError, type SessionUser, type SystemRole } from "@pm/domain";
import { sprintService } from "../../app/services/project/sprint.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

interface TestContextResult {
  ctx: RequestContext;
  user: SessionUser;
}

async function createTestContext(systemRole: SystemRole = "MEMBER", actorId?: string): Promise<TestContextResult> {
  const id = actorId ?? crypto.randomUUID();
  const db = createDatabase(env.DB);
  const now = new Date();
  const email = `test-${id}@example.com`;
  const fullName = `Test ${systemRole}`;

  const user: SessionUser = {
    id,
    email,
    fullName,
    systemRole,
    status: "ACTIVE",
  };

  await userRepository.insert(db, {
    id,
    email,
    fullName,
    systemRole,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const ctx: RequestContext = {
    env,
    db,
    user,
    requestId: "req-" + crypto.randomUUID(),
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, user };
}

async function createProjectWithMembers(db: ReturnType<typeof createDatabase>, creatorId: string) {
  const now = new Date();
  const projectId = crypto.randomUUID();
  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: `SP${crypto.randomUUID().slice(0, 6)}`.toUpperCase(),
      name: "Sprint Testing Project",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      createdById: creatorId,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: creatorId,
      projectRole: "PM",
      createdAt: now,
    }),
  ]);

  const statusTodo = await taskStatusRepository.insert(db, {
    id: crypto.randomUUID(),
    name: `Todo-${Date.now()}-${Math.random()}`,
    category: "TODO",
    position: 1,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  const statusDone = await taskStatusRepository.insert(db, {
    id: crypto.randomUUID(),
    name: `Done-${Date.now()}-${Math.random()}`,
    category: "DONE",
    position: 2,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  return { projectId, statusTodo, statusDone };
}

describe("sprintService (FR-36 / A11–A13)", () => {
  it("FR-36 c1 / A11: project PM or TEAM_LEAD creates sprint, audits SPRINT_CREATED atomically", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const sprint = await sprintService.createSprint(pmCtx, projectId, {
      name: "Sprint Alpha",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });

    expect(sprint).toBeDefined();
    expect(sprint.name).toBe("Sprint Alpha");
    expect(sprint.projectId).toBe(projectId);
    expect(sprint.startDate).toBe("2026-11-01");
    expect(sprint.endDate).toBe("2026-11-14");

    const auditLogs = await auditLogRepository.listByEntity(pmCtx.db, "SPRINT", sprint.id);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0]?.action).toBe("SPRINT_CREATED");
    expect(auditLogs[0]?.actorId).toBe(pmUser.id);
    expect(auditLogs[0]?.projectId).toBe(projectId);
  });

  it("FR-36 c1 / A12: updates sprint and audits SPRINT_UPDATED atomically", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const sprint = await sprintService.createSprint(pmCtx, projectId, {
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });

    const updated = await sprintService.updateSprint(pmCtx, projectId, {
      sprintId: sprint.id,
      name: "Sprint 1 Extended",
      startDate: "2026-11-01",
      endDate: "2026-11-20",
    });

    expect(updated.name).toBe("Sprint 1 Extended");
    expect(updated.endDate).toBe("2026-11-20");

    const auditLogs = await auditLogRepository.listByEntity(pmCtx.db, "SPRINT", sprint.id);
    const updateLog = auditLogs.find((l) => l.action === "SPRINT_UPDATED");
    expect(updateLog).toBeDefined();
    expect(updateLog?.actorId).toBe(pmUser.id);
  });

  it("FR-36 c4 / A13: archiveSprint unlinks tasks, increments their version, and audits SPRINT_ARCHIVED", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId, statusTodo } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const sprint = await sprintService.createSprint(pmCtx, projectId, {
      name: "Sprint to be archived",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });

    const taskId = crypto.randomUUID();
    const now = new Date();
    await pmCtx.db.batch([
      taskRepository.insertStmt(pmCtx.db, {
        id: taskId,
        projectId,
        statusId: statusTodo.id,
        sprintId: sprint.id,
        title: "Task in Sprint",
        createdById: pmUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    await sprintService.archiveSprint(pmCtx, projectId, { sprintId: sprint.id });

    // Verify sprint is soft-deleted
    const fetchedSprint = await sprintRepository.findById(pmCtx.db, sprint.id);
    expect(fetchedSprint).toBeUndefined();

    // Verify task is unlinked and version is incremented
    const fetchedTask = await taskRepository.findById(pmCtx.db, taskId);
    expect(fetchedTask?.sprintId).toBeNull();
    expect(fetchedTask?.version).toBe(2);

    // Verify audit log
    const auditLogs = await auditLogRepository.listByEntity(pmCtx.db, "SPRINT", sprint.id);
    const archiveLog = auditLogs.find((l) => l.action === "SPRINT_ARCHIVED");
    expect(archiveLog).toBeDefined();
    expect(archiveLog?.actorId).toBe(pmUser.id);
  });

  it("FR-36 c5: project MEMBER receives 403 on create, update, or archive", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const { ctx: memberCtx, user: memberUser } = await createTestContext("MEMBER");
    await pmCtx.db.batch([
      projectMemberRepository.insertStmt(pmCtx.db, {
        projectId,
        userId: memberUser.id,
        projectRole: "MEMBER",
        createdAt: new Date(),
      }),
    ]);

    const sprint = await sprintService.createSprint(pmCtx, projectId, {
      name: "Lead Sprint",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });

    // Member create -> 403
    await expect(
      sprintService.createSprint(memberCtx, projectId, {
        name: "Member Sprint",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
      }),
    ).rejects.toThrow(ForbiddenError);

    // Member update -> 403
    await expect(
      sprintService.updateSprint(memberCtx, projectId, {
        sprintId: sprint.id,
        name: "Hacked Sprint",
      }),
    ).rejects.toThrow(ForbiddenError);

    // Member archive -> 403
    await expect(
      sprintService.archiveSprint(memberCtx, projectId, {
        sprintId: sprint.id,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("RBAC: non-member receives 404 on all sprint operations", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const { ctx: nonMemberCtx } = await createTestContext("MEMBER");

    await expect(sprintService.listSprints(nonMemberCtx, projectId)).rejects.toThrow(NotFoundError);

    await expect(
      sprintService.createSprint(nonMemberCtx, projectId, {
        name: "Ghost Sprint",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("RBAC: archived project returns 403", async () => {
    const { ctx: adminCtx, user: adminUser } = await createTestContext("ADMIN");
    const { projectId } = await createProjectWithMembers(adminCtx.db, adminUser.id);

    await adminCtx.db.batch([projectRepository.archiveStmt(adminCtx.db, projectId, new Date())]);

    await expect(
      sprintService.createSprint(adminCtx, projectId, {
        name: "Sprint in Archived Project",
        startDate: "2026-11-01",
        endDate: "2026-11-14",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("Validation: rejects invalid dates and returns ValidationError", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    await expect(
      sprintService.createSprint(pmCtx, projectId, {
        name: "Backwards Sprint",
        startDate: "2026-11-20",
        endDate: "2026-11-10",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("listSprints calculates stats, completion rate and status", async () => {
    const { ctx: pmCtx, user: pmUser } = await createTestContext("PM");
    const { projectId, statusTodo, statusDone } = await createProjectWithMembers(pmCtx.db, pmUser.id);

    const sprint = await sprintService.createSprint(pmCtx, projectId, {
      name: "Stats Sprint",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
    });

    const now = new Date();
    await pmCtx.db.batch([
      taskRepository.insertStmt(pmCtx.db, {
        id: crypto.randomUUID(),
        projectId,
        statusId: statusTodo.id,
        sprintId: sprint.id,
        title: "Todo Task",
        createdById: pmUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      taskRepository.insertStmt(pmCtx.db, {
        id: crypto.randomUUID(),
        projectId,
        statusId: statusDone.id,
        sprintId: sprint.id,
        title: "Done Task",
        createdById: pmUser.id,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const sprints = await sprintService.listSprints(pmCtx, projectId);
    expect(sprints.length).toBe(1);
    const sprint0 = sprints[0];
    expect(sprint0).toBeDefined();
    if (sprint0) {
      expect(sprint0.taskCount).toBe(2);
      expect(sprint0.completedCount).toBe(1);
      expect(sprint0.completionRate).toBe(50);
      expect(sprint0.status).toBeDefined();
    }
  });
});
