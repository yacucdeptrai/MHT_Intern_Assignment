# Status Transition Implementation Plan (FR-21 / M4-T1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement workflow transition rules (`assertTransitionAllowed`) in `@pm/domain` and atomic status changes (`taskService.changeStatus`, A16) with UI controls on the task detail page (FR-21 c1–4).

**Architecture:** Encode the complete status transition matrix (`docs/05` §6.2) and category move policy (`canMoveTaskToCategory`) in `@pm/domain`, validate payloads with `TaskStatusChangeSchema` at `taskDetailAction` and in `taskService.changeStatus`, execute batch A16 (`taskRepository.updateStatusStmt` + `conflictGuardStmt` + `TASK_STATUS_CHANGED` audit + `SLACK_UPDATE_THREAD` outbox job + post-commit `dispatchOutbox`), and render the status selector on `_app.projects.$projectId.tasks.$taskId.tsx` driven solely by loader-computed permissions.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** `docs/01-srs.md` (FR-21), `docs/03-database-design.md` (`tasks.status_changed_at`), `docs/04-data-access-and-atomicity.md` (A16), `docs/05-rbac-and-workflow.md` (§3.2, §5, §6.2), `docs/06-routes-and-actions.md` (§3.5), `docs/07-background-jobs-and-integrations.md` (§1.4)

## Global Constraints
- Non-members receive `404` on every project-scoped loader and action (`P3`).
- Archived projects reject mutations with `403 "This project is archived"` (`FR-09 c4`).
- Moving to a `DONE` status via `UPDATE` rejects with `403 "Only an approval can complete a task"` (`FR-21 c2`).
- Moving from a `DONE` status via `UPDATE` rejects with `403 "Reopen the task to edit it"` (`FR-21 c3`, `FR-13 c4`).
- Version conflicts reject with `409 "This task was changed by someone else. Reload to see the latest version."` and write zero rows.

## Review Focus
- Client-supplied `statusId` does not exist in `task_statuses` -> `400 "Status not found"`.
- Editor submits a `DONE`-category `statusId` directly via POST -> `403 "Only an approval can complete a task"` and DB row stays unchanged.
- Moving between two different statuses in the same category (e.g. `IN_PROGRESS` -> `IN_PROGRESS`) -> allowed, updates `status_changed_at`, bumps `version`, audits, and queues `SLACK_UPDATE_THREAD`.
- Stale `version` on `changeStatus` -> `409`, zero audit or outbox rows written.
- Forced failure of a later statement in batch A16 -> entire batch rolls back (`tasks.status_id`, `status_changed_at`, and `version` remain unchanged).

---

### Task 1: Domain Workflow, Policy & Schemas (`@pm/domain`)

**Files:**
- Create: `packages/domain/src/workflow.ts`
- Modify: `packages/domain/src/policies/project.ts`
- Modify: `packages/domain/src/schemas/task.ts`
- Modify: `packages/domain/src/types/task.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/workflow.test.ts`

- [ ] **Step 1: Write failing unit tests in `packages/domain/test/workflow.test.ts`** covering every row of `docs/05` §6.2 (`UPDATE`, `APPROVE`, `REJECT`, `REOPEN` across `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`), `canMoveTaskToCategory`, `TaskStatusChangeSchema`, and `SlackUpdateThreadPayloadSchema`.
- [ ] **Step 2: Run Vitest on `packages/domain/test/workflow.test.ts` and confirm RED.**
- [ ] **Step 3: Implement `workflow.ts`, `canMoveTaskToCategory`, `TaskStatusChangeSchema`, `SlackUpdateThreadPayloadSchema`, and `StatusOption.canSelect`.**
- [ ] **Step 4: Run Vitest on `packages/domain` and confirm GREEN.**

### Task 2: Repository `updateStatusStmt` & Service `changeStatus` (A16)

**Files:**
- Modify: `packages/db/src/repositories/task.repository.ts`
- Modify: `apps/web/app/services/task.service.ts`
- Test: `packages/db/test/taskRepository.test.ts`
- Test: `apps/web/test/task/task.service.test.ts`

- [ ] **Step 1: Write failing repository test for `updateStatusStmt`** (updates `statusId`, `statusChangedAt`, `version + 1`, `updatedAt`, preserves `completedAt` when omitted, fails `conflictGuardStmt` on stale version) and **service tests for `taskService.changeStatus`** covering FR-21 c1–4, archived project 403, non-member 404, unknown status 400, version conflict 409, and forced batch failure atomicity (`docs/09` §3.3).
- [ ] **Step 2: Run Vitest on those test files and confirm RED.**
- [ ] **Step 3: Implement `updateStatusStmt` refinement and `taskService.changeStatus` (A16) + `StatusOption.canSelect` in `getTaskDetails`.**
- [ ] **Step 4: Run Vitest on `packages/db` and `apps/web/test/task/task.service.test.ts` and confirm GREEN.**

### Task 3: Action, Task Detail UI, 404 Sweep & E2E

**Files:**
- Modify: `apps/web/app/actions/taskDetailAction.ts`
- Modify: `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`
- Modify: `apps/web/test/task/taskDetailRoute.test.ts`
- Modify: `apps/web/test/project/projectVisibilitySweep.test.ts`
- Modify: `apps/web/e2e/helpers.ts`
- Create: `apps/web/e2e/statusTransition.spec.ts`

- [ ] **Step 1: Write failing route/action tests in `taskDetailRoute.test.ts` and 404 sweep tests in `projectVisibilitySweep.test.ts` (`taskDetailLoader` & `taskDetailAction`).**
- [ ] **Step 2: Run Vitest on those test files and confirm RED.**
- [ ] **Step 3: Implement `intent === "changeStatus"` in `taskDetailAction.ts` (removing `TODO(M4-T1)`) and status selector UI in `_app.projects.$projectId.tasks.$taskId.tsx` (removing route-level `task.statusCategory === "DONE"` edit gating in favor of `permissions.canEdit` + `s.canSelect`).**
- [ ] **Step 4: Run Vitest and confirm GREEN; add Playwright E2E tests in `apps/web/e2e/statusTransition.spec.ts` (including moving to `IN_PROGRESS`/`REVIEW` and Journey 7 direct POST of a `DONE` status returning 403 with unchanged status).**
- [ ] **Step 5: Verify `git grep "TODO(M4-T1)"` is empty, run full suite + build + clean CI-style E2E, commit, push, PR, and merge into `develop`.**
