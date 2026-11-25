# Task Reject and Reopen Implementation Plan (FR-23 / M4-T3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `comments` table (forward-only migration, Drizzle schema, `commentRepository.insertStmt`) and implement atomic task rejection and reopening (`taskService.rejectTask` and `taskService.reopenTask`, A19) with reason validation and Reject / Reopen controls on the task detail page (FR-23 c1–4).

**Architecture:** Add forward-only migration `0009_comments.sql` with all `docs/03` columns, self-FK, CHECK constraints, and `idx_comments_task`, Drizzle `comments` schema, and `commentRepository`; add `TaskReasonSchema` in `@pm/domain`; implement `rejectTask` and `reopenTask` executing batch A19 (`updateStatusStmt` to default `IN_PROGRESS` clearing `completedAt` + `conflictGuardStmt` + root `comments` insert + `TASK_REJECTED`/`TASK_REOPENED` audit + `TASK_REJECTED`/`TASK_REOPENED` notifications with `{ title, actorName, reason }` + `SLACK_UPDATE_THREAD` outbox job with `reasonCommentId` + post-commit `dispatchOutbox` and `TODO(M6-T2)`); wire `reject` and `reopen` intents in `taskDetailAction.ts`; render Reject and Reopen reason forms on `_app.projects.$projectId.tasks.$taskId.tsx` (deferring comment thread rendering to `M5-T1` while recording `reason` in audit changes for `M4-T4`).

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** `docs/01-srs.md` (FR-23), `docs/03-database-design.md` (`comments`, `tasks.completed_at`, `notifications`), `docs/04-data-access-and-atomicity.md` (A19), `docs/05-rbac-and-workflow.md` (§3.2, §5.1, §6.2, §6.3), `docs/06-routes-and-actions.md` (§3.5), `docs/07-background-jobs-and-integrations.md` (§1.4)

## Global Constraints
- `comments` migration is forward-only and additive (`0009_comments.sql`) with `CHECK (length(body) BETWEEN 1 AND 5000)`, `parent_comment_id` self-FK, `deleted_at`, and `idx_comments_task` on `(task_id, created_at)`.
- No comment thread listing, replies, or delete UI in M4-T3 (owned by `M5-T1`).
- Empty or whitespace-only reason rejects with `400 "A reason is required"` (`FR-23 c2`); reason > 2,000 chars after trim rejects with `400`.
- Non-members receive `404` (`P3`); archived projects receive `403 "This project is archived"` (`FR-09 c4`); project `MEMBER` receives `403` (`FR-23 c4`).
- Reopen clears `tasks.completed_at` to `NULL` and updates `status_changed_at` to `now` (`docs/03` lines 250–251, `docs/04` A19).

## Review Focus
- Whitespace-only reason (`"   "`) -> trimmed to `""` and rejected with `400 "A reason is required"`.
- Reason of 2,000 characters succeeds; 2,001 characters rejects with `400`.
- Reopening a `DONE` task clears `completed_at` back to `null` and unfreezes editing (`canEdit` becomes `true` again).
- Rejecting a task not in `REVIEW` -> `400 "Only tasks in review can be rejected"`; reopening a task not in `DONE` -> `400 "Only completed tasks can be reopened"`.
- Forced failure of `outbox_jobs` insert at end of batch A19 -> rolls back `tasks`, `comments`, `audit_logs`, and `notifications`.

---

### Task 1: `comments` Migration, Drizzle Schema & `commentRepository` (`@pm/db`)

**Files:**
- Create: `packages/db/migrations/0009_comments.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Create: `packages/db/src/schema/comments.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/repositories/comment.repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/commentRepository.test.ts`

- [ ] **Step 1: Write failing repository & constraint tests in `packages/db/test/commentRepository.test.ts`** (root comment insert, reply self-FK, soft-delete filtering, `CHECK` rejecting empty body or > 5,000 chars, FK enforcement, `EXPLAIN QUERY PLAN` using `idx_comments_task`).
- [ ] **Step 2: Run Vitest on `commentRepository.test.ts` and confirm RED.**
- [ ] **Step 3: Create `0009_comments.sql`, update `_journal.json`, implement `comments.ts` and `comment.repository.ts`, and export from `@pm/db`.**
- [ ] **Step 4: Run `pnpm db:migrate:local` and Vitest on `@pm/db` to confirm GREEN.**

### Task 2: Domain `TaskReasonSchema` & Service `rejectTask` / `reopenTask` (A19)

**Files:**
- Modify: `packages/domain/src/schemas/task.ts`
- Modify: `apps/web/app/services/task.service.ts`
- Test: `packages/domain/test/workflow.test.ts`
- Test: `apps/web/test/task/task.service.test.ts`

- [ ] **Step 1: Write failing tests** for `TaskReasonSchema` (trimming, empty -> `"A reason is required"`, 2,000 boundary, 2,001 rejected) and `taskService.rejectTask` & `taskService.reopenTask` (FR-23 c1–4, clearing `completedAt` on reopen, root comment stored in D1, `TASK_REJECTED`/`TASK_REOPENED` audit & notifications with `reason`, `SLACK_UPDATE_THREAD` with `reasonCommentId`, sole-assignee empty notification list, stale version 409, forced batch failure rollback across all 5 tables).
- [ ] **Step 2: Run Vitest and confirm RED.**
- [ ] **Step 3: Implement `TaskReasonSchema`, `taskService.rejectTask`, and `taskService.reopenTask` (A19).**
- [ ] **Step 4: Run Vitest and confirm GREEN.**

### Task 3: Action, Reject/Reopen UI & Playwright E2E

**Files:**
- Modify: `apps/web/app/actions/taskDetailAction.ts`
- Modify: `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`
- Modify: `apps/web/test/task/taskDetailRoute.test.ts`
- Create: `apps/web/e2e/taskReject.spec.ts`

- [ ] **Step 1: Write failing action tests in `taskDetailRoute.test.ts` (`intent=reject` and `intent=reopen`: FR-23 c1–4, empty reason 400 `"A reason is required"`, non-member 404).**
- [ ] **Step 2: Run Vitest and confirm RED.**
- [ ] **Step 3: Implement `reject` and `reopen` intents in `taskDetailAction.ts` (resolving `TODO(M4-T3)`) and Reject / Reopen forms on `_app.projects.$projectId.tasks.$taskId.tsx` (preserving input on 400 error, closing on `success === true`, plus `TODO(M5-T1)` comment).**
- [ ] **Step 4: Run Vitest to confirm GREEN, write `apps/web/e2e/taskReject.spec.ts`, verify `git grep "TODO(M4-T3)"` is empty, run full verification, push, PR, and merge.**
