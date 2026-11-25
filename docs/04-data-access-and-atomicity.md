# Data Access and Atomicity

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [Database design](./03-database-design.md) · [RBAC & workflow](./05-rbac-and-workflow.md) · [Architecture](./02-architecture.md) · [Background jobs](./07-background-jobs-and-integrations.md)

---

## 1. Why This Document Exists

D1 has **no interactive transactions**. Prisma-style `$transaction(async (tx) => …)` callbacks are not available, and assuming them is the bug behind review lesson #3. D1 does offer **batches**: `db.batch([...])` sends several statements that run sequentially as **one SQL transaction**. If any statement fails, the whole batch rolls back.

This document defines how every multi-record write is built as a single batch, how concurrent edits are detected *inside* that batch, and what may happen only after it commits.

## 2. Repository Conventions

- **Location:** `packages/db/src/repositories/<entity>.repository.ts`. Each file exports one object named `<entity>Repository` (e.g. `taskRepository`).
- **Injected database.** Every method takes `db: AppDatabase` as its **first** parameter. Repositories never import a global client, never call `drizzle()` themselves, and never read `env`.
- **Two kinds of method:**

| Kind | Naming | Returns | Used for |
| :--- | :--- | :--- | :--- |
| **Executing** | verb phrase: `findById`, `listByProject`, `countByStatus` | `Promise<T>`, awaited by the caller | reads; single-statement writes that need no companion records |
| **Statement builder** | suffix `Stmt`: `insertStmt`, `updateStatusStmt`, `insertAuditStmt` | an **un-awaited** Drizzle query (`BatchItem<'sqlite'>`) | anything that goes into a batch |

- **Typed results only.** Return types are `InferSelectModel<…>`, explicit projections, or named DTO types in `packages/db/src/types.ts`. No `any` and no `as` casts on query results (review lesson #12). Raw SQL is allowed only through Drizzle's `sql` template, with typed `.mapWith()` or `$type<>()`, and only where the builder cannot express the query. Each use is listed in §7.
- **Soft-delete filtering is the repository's job.** Callers never add `deleted_at IS NULL` themselves.

```typescript
// ❌ Global client: ignores the caller's batch and cannot be tested in isolation
import { db } from '../client';
export const taskRepository = { findById: (id: string) => db.query.tasks.findFirst({ where: eq(tasks.id, id) }) };

// ✅ Injected db, executing method + statement builder
export const taskRepository = {
  findById: (db: AppDatabase, id: string) =>
    db.query.tasks.findFirst({ where: and(eq(tasks.id, id), isNull(tasks.deletedAt)) }),

  updateStatusStmt: (db: AppDatabase, p: { id: string; expectedVersion: number; statusId: string; now: Date }) =>
    db.update(tasks)
      .set({ statusId: p.statusId, version: sql`${tasks.version} + 1`, updatedAt: p.now })
      .where(and(eq(tasks.id, p.id), eq(tasks.version, p.expectedVersion), isNull(tasks.deletedAt))),
};
```

## 3. The Batch Pattern

Services own atomicity. A service operation that writes more than one row follows these steps, always in this order:

1. **Authorize:** `loadProjectAccess`, then the policy check ([RBAC §5](./05-rbac-and-workflow.md#5-policy-functions)).
2. **Pre-read:** load everything the decision needs (task, status, assignees, default statuses). TypeScript code cannot branch on intermediate results inside a batch, so every decision is made from reads taken first. Later *SQL* statements in a batch do see earlier writes; the number allocation in A14 and the fallback guard below rely on that. Combine independent reads in one `db.batch([...])` to stay within the Free plan's 50 queries per request (risk R2).
3. **Validate:** domain rules such as `assertTransitionAllowed` and "assignees must be members".
4. **Prepare:** generate every ID with `crypto.randomUUID()`, take `now` once, and build the payloads.
5. **Batch:** call `db.batch([...])` with the guarded write first, then `conflictGuardStmt(db)`, then the companion inserts.
6. **Map errors:** a guard failure becomes `ConflictError` (409). Any other error is rethrown, which yields a 500.
7. **After commit only:** `ctx.waitUntil(dispatchOutbox(ctx, jobIds))` and `ctx.waitUntil(publishNotifications(ctx, notificationIds))`.

### 3.1 The version guard

A conditional `UPDATE … WHERE id = ? AND version = ?` that matches zero rows does **not** error. Without a guard, D1 would commit the audit row, notifications, and outbox jobs for a change that never happened. So **every optimistic-concurrency write, meaning a write where 0 affected rows means "someone else changed it" (the rows marked "guard" in §4), is followed immediately by `conflictGuardStmt(db)`**. The guard makes the batch fail when that write changed nothing.

Rules:
- **Do not guard writes that may legitimately touch 0 rows**: deleting a removed member's assignments (A5), unlinking tasks from an archived sprint (A13), archiving a task's sub-tasks (A20). Guarding them would raise false 409s for empty sprints, members without tasks, or tasks without sub-tasks.
- **Never chain `changes()`-dependent statements after a guard.** A guard that inserts nothing leaves `changes()` at 0, so a second guard or an A27-style `WHERE changes() = 1` placed after it would misfire. A guard must always directly follow the write it protects.

The guard uses an always-empty table whose only column has a named CHECK constraint (see [`batch_guard` in the database design](./03-database-design.md#batch_guard)):

```sql
-- migration
CREATE TABLE batch_guard (ok INTEGER NOT NULL CONSTRAINT version_conflict CHECK (ok = 1));

-- conflictGuardStmt(db): inserts a row (and so violates the CHECK) only when the previous statement changed 0 rows
INSERT INTO batch_guard (ok) SELECT 0 WHERE changes() = 0;
```

When the previous statement changed a row, nothing is inserted and the batch continues. When it changed nothing, the insert violates `version_conflict`, D1 rolls back the entire batch, and the error message contains `CHECK constraint failed: version_conflict`. `isVersionConflict(error: unknown): boolean` in `packages/db/src/batch.ts` recognizes that message.

```typescript
// packages/db/src/batch.ts
export const conflictGuardStmt = (db: AppDatabase) =>
  db.run(sql`INSERT INTO batch_guard (ok) SELECT 0 WHERE changes() = 0`);

// Walks the cause chain: drizzle-orm may wrap the D1 error (e.g. DrizzleQueryError with the driver error in `cause`)
export const isVersionConflict = (error: unknown): boolean => {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.message.includes('version_conflict')) return true;
  }
  return false;
};
```

> **Must be proven before feature work (risk R5):** roadmap task [M0-T3](./10-implementation-roadmap.md#m0--foundation) runs an integration test against local D1 showing four things:
> 1. A batch with a stale version writes **zero** rows in every table.
> 2. `isVersionConflict` recognizes the error.
> 3. A batch with the current version commits everything.
> 4. `changes()` inside a Drizzle D1 batch refers to the preceding statement.
>
> **Fallback if (4) fails:** a **post-state assertion** that does not depend on `changes()`. A trigger cannot help here, because a 0-row `UPDATE` fires no row triggers. The fallback is `assertRowStmt(db, table, id, expectedNewVersion)`:
> ```sql
> INSERT INTO batch_guard (ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE id = ? AND version = ?);
> ```
> It is placed in the same position as the guard. It checks that the row now has the version the update should have produced; other tables check the column the write set. The services' call sites and `isVersionConflict` stay the same, and only `packages/db/src/batch.ts` changes. The outcome is recorded in [Risks](./11-risks-and-assumptions.md) R5.

### 3.2 Empty statement lists

Drizzle's `insert().values([])` throws, and `db.batch` requires at least one statement. Statement builders that take a list (`insertManyStmt` for notifications, assignees, sub-task updates) therefore return `null` for an empty list. Services build the batch with `compactBatch([...])` (`packages/db/src/batch.ts`), which drops `null` entries and keeps the type of the non-empty tuple. Typical empty cases:
- an unassigned task (A14)
- the approver being the only assignee, so nobody else is notified (A18)
- a comment whose author is the task's only creator and assignee (A21)

Each case has a test ([Testing §3.3](./09-testing-strategy.md#33-atomicity)).

The same guard protects any other conditional update, for example "set the default status only if it is still default".

### 3.3 Worked example: `approveTask`

```typescript
// apps/web/app/services/task.service.ts (condensed)
export async function approveTask(ctx: RequestContext, input: ApproveTaskInput): Promise<TaskDto> {
  const access = await loadProjectAccess(ctx, input.projectId);
  const [task, statuses, assignees] = await ctx.db.batch([
    taskRepository.findByIdStmt(ctx.db, input.taskId, input.projectId),
    taskStatusRepository.listStmt(ctx.db),
    taskAssigneeRepository.listByTaskStmt(ctx.db, input.taskId),
  ]);
  if (!task) throw new NotFoundError('Task not found');
  const current = categoryOf(statuses, task.statusId);
  const actor = toActor(ctx.user, access);
  if (!canApproveTask(actor)) throw new ForbiddenError('You cannot approve this task');      // role → 403
  assertTransitionAllowed(current, 'DONE', 'APPROVE');                                         // state → 400

  const now = new Date();
  const done = defaultStatus(statuses, 'DONE');
  const notifications = buildNotifications('TASK_APPROVED', task, assignees, ctx.user, now); // ids generated here
  const job = buildOutboxJob('SLACK_UPDATE_THREAD', { taskId: task.id, fromStatusId: task.statusId, toStatusId: done.id, actorId: ctx.user.id }, now);

  try {
    await ctx.db.batch(compactBatch([
      taskRepository.updateStatusStmt(ctx.db, { id: task.id, expectedVersion: input.version, statusId: done.id, completedAt: now, now }),
      conflictGuardStmt(ctx.db),
      auditLogRepository.insertStmt(ctx.db, auditEntry('TASK_APPROVED', task, ctx.user, now, { statusId: { from: task.statusId, to: done.id } })),
      notificationRepository.insertManyStmt(ctx.db, notifications), // null when nobody is notified
      outboxRepository.insertStmt(ctx.db, job),
    ]));
  } catch (error) {
    if (isVersionConflict(error)) throw new ConflictError('This task was changed by someone else. Reload to see the latest version.');
    throw error;
  }
  ctx.waitUntil(dispatchOutbox(ctx, [job.id]));
  ctx.waitUntil(publishNotifications(ctx, notifications.map((n) => n.id)));
  ctx.logger.info('Task approved', { taskId: task.id, projectId: task.projectId });
  return toTaskDto({ ...task, statusId: done.id, version: input.version + 1 });
}
```

## 4. Atomic Operations Catalog <a id="atomic-operations"></a>

Every operation below **must** be a single batch, with exactly the statements listed, in that order. "Guard" means `conflictGuardStmt` placed directly after the preceding conditional write. "Post-commit" effects run through `ctx.waitUntil` and may fail without affecting the committed data.

| # | Operation (service function) | Statements in order | Guard | Post-commit | FR |
| :-- | :--- | :--- | :--- | :--- | :--- |
| A1 | `projectService.createProject` | insert `projects`; insert `project_members` (creator, `PM`); insert `audit_logs` `PROJECT_CREATED` | unique `code` raises a constraint error → 400 | none | FR-07 |
| A2 | `projectService.updateProject` | update `projects` (where id, not deleted); guard; insert `audit_logs` `PROJECT_UPDATED` | yes | none | FR-08 |
| A3 | `projectService.archiveProject` | update `projects.deleted_at`; guard; insert `audit_logs` `PROJECT_ARCHIVED` | yes | none | FR-09 |
| A4 | `projectMemberService.addMember` | insert `project_members`; insert `audit_logs` `MEMBER_ADDED`; insert `notifications` `PROJECT_MEMBER_ADDED` | PK conflict → 400 "Already a member" | publish notification | FR-10 |
| A5 | `projectMemberService.removeMember` | delete `project_members` row; guard; delete that user's `task_assignees` on the project's unarchived tasks; insert `audit_logs` `MEMBER_REMOVED` | yes | none | FR-10 |
| A6 | `projectMemberService.changeRole` | update `project_members.project_role`; guard; insert `audit_logs` `MEMBER_ROLE_CHANGED` | yes | none | FR-11 |
| A7 | `inviteService.createInvite` | insert `invites`; insert `outbox_jobs` `EMAIL_INVITE` | none | dispatch job | FR-10, FR-37 |
| A8 | `inviteService.acceptInvite` | update `invites.accepted_at` (where id, `accepted_at IS NULL`, not expired); guard; insert or activate `users` (with password); insert `project_members` if the invite has a project | yes (blocks double acceptance) | none | FR-37 |
| A9 | `userService.createUser` | insert `users`; insert `invites` (for the set-password link); insert `audit_logs` `USER_CREATED` | unique email → 400 | none | FR-03 |
| A10 | `userService.updateUser` / `setStatus` / `setSystemRole` / `deleteUser` | update `users`; guard; insert `audit_logs` (`USER_UPDATED` / `USER_LOCKED` / `USER_UNLOCKED` / `USER_ROLE_CHANGED` / `USER_DELETED`) | yes | none | FR-03, FR-04 |
| A11 | `sprintService.createSprint` | insert `sprints`; insert `audit_logs` `SPRINT_CREATED` | none | none | FR-36 |
| A12 | `sprintService.updateSprint` | update `sprints`; guard; insert `audit_logs` `SPRINT_UPDATED` | yes | none | FR-36 |
| A13 | `sprintService.archiveSprint` | update `sprints.deleted_at`; guard; update `tasks.sprint_id = NULL` where `sprint_id` matches (incrementing `version`); insert `audit_logs` `SPRINT_ARCHIVED` | yes | none | FR-36 |
| A14 | `taskService.createTask` (also sub-tasks) | insert `tasks` (number allocated in the insert); insert `task_assignees` (if a lead assigned them); insert `audit_logs` `TASK_CREATED`; insert `notifications` `TASK_ASSIGNED` (per assignee); insert `outbox_jobs` `SLACK_POST_TASK` (top-level tasks only) | none | dispatch job, publish | FR-12, FR-17 |
| A15 | `taskService.updateTask` | update `tasks` (version guard); guard; if the sprint changed, update `tasks.sprint_id` of its sub-tasks (unguarded, may touch 0 rows); insert `audit_logs` `TASK_UPDATED` | yes | none | FR-13, FR-36 |
| A16 | `taskService.changeStatus` | update `tasks.status_id` and `status_changed_at` (version guard); guard; insert `audit_logs` `TASK_STATUS_CHANGED`; insert `outbox_jobs` `SLACK_UPDATE_THREAD` | yes | dispatch job | FR-21 |
| A17 | `taskService.assignTask` | update `tasks.version` (version guard); guard; delete `task_assignees` for the task; insert the new `task_assignees`; insert `audit_logs` `TASK_ASSIGNED`; insert `notifications` `TASK_ASSIGNED` (new assignees only) | yes | publish | FR-15 |
| A18 | `taskService.approveTask` | see §3.3 (sets `status_changed_at` and `completed_at`) | yes | dispatch, publish | FR-22 |
| A19 | `taskService.rejectTask` / `reopenTask` | update `tasks.status_id` to the default `IN_PROGRESS`, set `status_changed_at`, clear `completed_at` (version guard); guard; insert `comments` (the reason); insert `audit_logs` `TASK_REJECTED` / `TASK_REOPENED`; insert `notifications`; insert `outbox_jobs` `SLACK_UPDATE_THREAD` | yes | dispatch, publish | FR-23 |
| A20 | `taskService.archiveTask` | update `tasks.deleted_at` (version guard); guard; update `tasks.deleted_at` for its sub-tasks; insert `audit_logs` `TASK_ARCHIVED` | yes | none | FR-14 |
| A21 | `commentService.addComment` | insert `comments`; insert `notifications` `TASK_COMMENTED` (creator and assignees, excluding the author) | none | publish | FR-19 |
| A22 | `commentService.deleteComment` | update `comments.deleted_at`; guard | yes | none | FR-19 |
| A23 | `attachmentService.addAttachment` | insert `attachments`; insert `audit_logs` `ATTACHMENT_ADDED` (the R2 put happens **before**; see §5) | none | none | FR-18 |
| A24 | `attachmentService.deleteAttachment` | delete `attachments` row; guard; insert `audit_logs` `ATTACHMENT_REMOVED` | yes | R2 delete | FR-18 |
| A25 | `taskStatusService.setDefault` | update the old default `is_default = 0`; guard; update the new default `is_default = 1`; guard; insert `audit_logs` `STATUS_UPDATED` | yes | none | FR-20 |
| A26 | `taskStatusService.deleteStatus` | delete from `task_statuses` where id **and** `NOT EXISTS (SELECT 1 FROM tasks WHERE status_id = ?)` and not default; guard; insert `audit_logs` `STATUS_DELETED` | yes (blocks deletion if a task started using it after the pre-read) | none | FR-20 |
| A27 | `reminderService.enqueueReminder` (cron, once per task × assignee × kind) | `INSERT OR IGNORE` `reminder_log` (keyed with `user_id`); insert `outbox_jobs` `EMAIL_DEADLINE_REMINDER` **only if** `changes() = 1` (written as `INSERT … SELECT … WHERE changes() = 1`) | idempotent by PK | dispatched by the same cron tick | FR-29 |
| A28 | `notificationService.markRead` / `markAllRead` | single update | n/a (single statement) | none | FR-25 |

| A29 | `userService.updateAvatar` | update `users.avatar_key` and `updated_at`; guard; insert `audit_logs` `USER_UPDATED` (the R2 put of `avatars/{userId}` happens **before**) | yes | none | FR-06 |

Statuses created or renamed (`STATUS_CREATED`, `STATUS_UPDATED`) use the A2 pattern: write, guard, audit.

**Deliberate narrowing of the design's list (spec §6.2).** The design listed outbox jobs for "task update or move", "assign", and "comment create", and a notification for "member remove". This catalog implements less, on purpose:
- **Slack** receives only new tasks and status changes (FR-27, FR-28). So task updates (A15), assignment (A17), and comments (A21) create no outbox job. Status *moves* (A16, A18, A19) do.
- **`NotificationType`** covers exactly the events FR-25 lists (assigned, commented, approved, rejected, reopened, added to project). Member removal (A5) therefore sends no notification.

Adding any of these later means adding an `OutboxJobType` or a `NotificationType` value. Nothing else in the batch pattern changes.

## 5. What Happens Outside the Batch

| Effect | When | Why | Failure handling |
| :--- | :--- | :--- | :--- |
| R2 **put** (attachment, avatar) | **Before** the batch | The DB row must never point at a missing object | If the batch fails, delete the object in the `catch`. An hourly cron removes orphan attachment objects (the `projects/` prefix only, never `avatars/`) older than 24 hours with no `attachments` row, resuming from a stored cursor ([Background jobs §2](./07-background-jobs-and-integrations.md#2-scheduled-handler)). |
| R2 **delete** | After commit, through `waitUntil` | The DB is the source of truth. A leftover object is harmless and gets swept up | The orphan sweep retries |
| Realtime push to the Durable Object | After commit, through `waitUntil` | Never notify about uncommitted data | The client refetches on reconnect ([Background jobs §4](./07-background-jobs-and-integrations.md#4-realtime-notifications)) |
| Slack, email | Never directly. Always as an `outbox_jobs` row in the batch, then dispatched | A job exists if and only if the change committed | Outbox retries ([Background jobs §1](./07-background-jobs-and-integrations.md#1-transactional-outbox)) |
| Logging | After commit | Logs describe what actually happened | n/a |

**Never** call `fetch`, R2 delete, a Durable Object, or an `EmailSender` before a batch commits. Code that does is rejected in review.

## 6. Reads and the Query Budget

- Loaders that need several independent reads send them in one `db.batch([...])`, which counts as one query against the Free plan's 50-per-invocation limit. Statement builders that only read are suffixed `Stmt` too (e.g. `findByIdStmt`).
- List endpoints paginate (50 per page by default) and count with a second statement in the same read batch. They never use `findMany` + `count` as two round trips (review lesson #17).
- Report aggregations run in SQL (`GROUP BY` on category, assignee, sprint), never by loading every task into the Worker.

## 7. Raw SQL Register

Raw `sql` fragments are allowed only here, and each is covered by an integration test:

| Where | Fragment | Reason |
| :--- | :--- | :--- |
| `batch.ts` `conflictGuardStmt` | `INSERT INTO batch_guard (ok) SELECT 0 WHERE changes() = 0` | Guard pattern (§3.1) |
| `task.repository.ts` `insertStmt` | `COALESCE(MAX(number), 0) + 1` sub-select | Per-project number allocation |
| `reminder.repository.ts` `insertJobIfNewStmt` | `INSERT … SELECT … WHERE changes() = 1` | Idempotent reminder enqueue (A27) |
| `outbox.repository.ts` `claimStmt` | `UPDATE … WHERE id = ? AND status IN ('PENDING','FAILED')` with `changes()` check | Job claim ([Background jobs §1](./07-background-jobs-and-integrations.md#1-transactional-outbox)) |
| `task.repository.ts` `versionIncrement` | `${tasks.version} + 1` | Atomic increment |

## 8. Anti-Patterns (from code review)

| Review lesson (`nativedocs/09`) | Anti-pattern | Rule in this stack |
| :--- | :--- | :--- |
| #3 Repository uses the global client | `prisma.user.findUnique` ignoring the injected `db` | `db` is the first parameter of every repository method (§2). ESLint `no-restricted-imports` bans importing a client in `packages/db/src/repositories/**`. |
| #12 Casting query results to `any` | `const invite = (await repo.find(...)) as any` | Repository return types are inferred or named DTOs. `@typescript-eslint/no-explicit-any` and `no-unsafe-*` are errors. |
| #18 Complex metadata lookup inside the transaction | Finding notifications by JSON metadata inside the write | Lookups happen in the pre-read step (§3, step 2) through a dedicated repository method. Batches contain writes and guards only. |
| (D1-specific) Awaiting statements one by one for a multi-row change | `await insertA; await insertB;` | Partial commits are possible. Use one `db.batch` (§4). |
| (D1-specific) A conditional update without a guard | `UPDATE … WHERE version = ?` alone | Always follow it with `conflictGuardStmt` (§3.1). |
