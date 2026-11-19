import { env } from "cloudflare:workers";

import {
  createDatabase,
  projectMemberRepository,
  projectRepository,
  taskAssigneeRepository,
  taskRepository,
  taskStatusRepository,
  userRepository,
  type AppDatabase,
  type TaskRow,
} from "@pm/db";
import {
  ForbiddenError,
  NotFoundError,
  type FileBody,
  type FileStorage,
  type ProjectRole,
  type StoredFile,
  type SystemRole,
} from "@pm/domain";

import { taskStatusService } from "../../app/services/taskStatus.service";
import type { RequestContext } from "../../app/utils/requestContext.server";

export class MemoryFileStorage implements FileStorage {
  private files = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: FileBody, options: { contentType: string }): Promise<void> {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    this.files.set(key, { body: bytes, contentType: options.contentType });
  }

  get(key: string): Promise<StoredFile | null> {
    const file = this.files.get(key);
    if (!file) return Promise.resolve(null);
    return Promise.resolve({
      key,
      size: file.body.byteLength,
      contentType: file.contentType,
      body: new Response(file.body as unknown as BodyInit).body as ReadableStream<Uint8Array>,
    });
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  has(key: string): boolean {
    return this.files.has(key);
  }
}

export type MatrixActor = "admin" | "projectPm" | "projectLead" | "creator" | "assignee" | "otherMember" | "nonMember";

export type ExpectedPermission = "allow" | 403 | 404;

export interface TestUserEntity {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  projectRole?: ProjectRole;
}

export function makeRequestContext(
  db: AppDatabase,
  user: TestUserEntity | null,
  storage?: FileStorage,
): RequestContext {
  return {
    db,
    storage: storage ?? new MemoryFileStorage(),
    env: {
      ...env,
      SESSION_SECRET: env.SESSION_SECRET || "test-session-secret-at-least-32-chars-long",
      APP_BASE_URL: env.APP_BASE_URL || "http://localhost:3000",
    },
    user: user
      ? {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          systemRole: user.systemRole,
          status: "ACTIVE",
        }
      : null,
    requestId: "test-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };
}

export interface PermissionFixture {
  db: AppDatabase;
  projectId: string;
  actors: Record<MatrixActor, TestUserEntity>;
  makeCtx: (actor: MatrixActor) => RequestContext;
  createTestTask: (overrides?: Partial<TaskRow>) => Promise<TaskRow>;
  todoStatusId: string;
  inProgressStatusId: string;
  reviewStatusId: string;
  doneStatusId: string;
}

export async function setupPermissionFixture(): Promise<PermissionFixture> {
  const db = createDatabase(env.DB);
  const dummyCtx = makeRequestContext(db, null);
  await taskStatusService.seedDefaultStatuses(dummyCtx);

  const todoStatus = await taskStatusRepository.findDefaultByCategory(db, "TODO");
  const inProgressStatus = await taskStatusRepository.findDefaultByCategory(db, "IN_PROGRESS");
  const reviewStatus = await taskStatusRepository.findDefaultByCategory(db, "REVIEW");
  const doneStatus = await taskStatusRepository.findDefaultByCategory(db, "DONE");

  if (!todoStatus || !inProgressStatus || !reviewStatus || !doneStatus) {
    throw new Error("Default statuses not found after seeding");
  }

  const now = new Date();
  const makeUser = async (role: SystemRole, tag: string): Promise<TestUserEntity> => {
    const id = crypto.randomUUID();
    const user = await userRepository.insert(db, {
      id,
      email: `perm-${tag}-${id.slice(0, 8)}@example.com`,
      fullName: `User ${tag}`,
      systemRole: role,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      systemRole: user.systemRole,
    };
  };

  const admin = await makeUser("ADMIN", "admin");
  const projectPm = await makeUser("MEMBER", "projectPm");
  const projectLead = await makeUser("MEMBER", "projectLead");
  const creator = await makeUser("MEMBER", "creator");
  const assignee = await makeUser("MEMBER", "assignee");
  const otherMember = await makeUser("MEMBER", "otherMember");
  const nonMember = await makeUser("MEMBER", "nonMember");

  admin.projectRole = "PM";
  projectPm.projectRole = "PM";
  projectLead.projectRole = "TEAM_LEAD";
  creator.projectRole = "MEMBER";
  assignee.projectRole = "MEMBER";
  otherMember.projectRole = "MEMBER";

  const projectId = crypto.randomUUID();
  await db.batch([
    projectRepository.insertStmt(db, {
      id: projectId,
      code: `P${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "Permission Test Project",
      status: "ACTIVE",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      createdById: projectPm.id,
      createdAt: now,
      updatedAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: projectPm.id,
      projectRole: "PM",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: projectLead.id,
      projectRole: "TEAM_LEAD",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: creator.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: assignee.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
    projectMemberRepository.insertStmt(db, {
      projectId,
      userId: otherMember.id,
      projectRole: "MEMBER",
      createdAt: now,
    }),
  ]);

  const actors: Record<MatrixActor, TestUserEntity> = {
    admin,
    projectPm,
    projectLead,
    creator,
    assignee,
    otherMember,
    nonMember,
  };

  const storage = new MemoryFileStorage();

  const makeCtx = (actor: MatrixActor): RequestContext => {
    return makeRequestContext(db, actors[actor], storage);
  };

  const createTestTask = async (overrides?: Partial<TaskRow>): Promise<TaskRow> => {
    const taskId = overrides?.id ?? crypto.randomUUID();
    const taskNow = new Date();
    const nextNumber = overrides?.number ?? Math.floor(Math.random() * 100000) + 1;
    const task: TaskRow = {
      id: taskId,
      projectId,
      number: nextNumber,
      title: overrides?.title ?? "Permission Task",
      description: overrides?.description ?? null,
      statusId: overrides?.statusId ?? todoStatus.id,
      priority: overrides?.priority ?? "MEDIUM",
      startDate: overrides?.startDate ?? null,
      dueDate: overrides?.dueDate ?? null,
      parentTaskId: overrides?.parentTaskId ?? null,
      sprintId: overrides?.sprintId ?? null,
      createdById: overrides?.createdById ?? creator.id,
      slackThreadTs: overrides?.slackThreadTs ?? null,
      completedAt: overrides?.completedAt ?? null,
      version: overrides?.version ?? 1,
      createdAt: overrides?.createdAt ?? taskNow,
      updatedAt: overrides?.updatedAt ?? taskNow,
      statusChangedAt: overrides?.statusChangedAt ?? taskNow,
      deletedAt: overrides?.deletedAt ?? null,
    };

    await db.batch([
      taskRepository.insertStmt(db, task),
      ...taskAssigneeRepository.insertBatchStmt(db, taskId, [assignee.id], taskNow),
    ]);

    return task;
  };

  return {
    db,
    projectId,
    actors,
    makeCtx,
    createTestTask,
    todoStatusId: todoStatus.id,
    inProgressStatusId: inProgressStatus.id,
    reviewStatusId: reviewStatus.id,
    doneStatusId: doneStatus.id,
  };
}

export async function assertPermission(actionFn: () => Promise<unknown>, expected: ExpectedPermission): Promise<void> {
  if (expected === "allow") {
    await actionFn();
  } else if (expected === 403) {
    try {
      await actionFn();
      throw new Error("Expected ForbiddenError (403) but action succeeded");
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        return;
      }
      throw err;
    }
  } else {
    try {
      await actionFn();
      throw new Error("Expected NotFoundError (404) but action succeeded");
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        return;
      }
      throw err;
    }
  }
}
