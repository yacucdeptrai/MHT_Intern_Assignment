# Task Approval Implementation Plan (FR-22 / M4-T2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement atomic task approval (`taskService.approveTask`, A18) moving tasks in `REVIEW` to the default `DONE` status with `status_changed_at` and `completed_at`, auditing `TASK_APPROVED`, notifying assignees, queuing `SLACK_UPDATE_THREAD`, and rendering the Approve control on the task detail page (FR-22 c1–4).

**Architecture:** Add `TaskApproveSchema` in `@pm/domain`, implement `taskService.approveTask` following `docs/04` §3.3 and row A18 (`updateStatusStmt` setting `completedAt: now` and `statusChangedAt: now` + `conflictGuardStmt` + `TASK_APPROVED` audit + `notificationRepository.insertManyStmt` for assignees excluding the approver + `SLACK_UPDATE_THREAD` outbox job + `dispatchOutbox` post-commit + `TODO(M6-T2): publishNotifications after commit`), compute `TaskPermissions.canApprove` (`canApproveTask(actor) && isTransitionAllowed(target.category, 'DONE', 'APPROVE')`) in `getTaskDetails`, wire `intent=approve` in `taskDetailAction.ts`, and render the Approve button on `_app.projects.$projectId.tasks.$taskId.tsx`.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** `docs/01-srs.md` (FR-22), `docs/03-database-design.md` (`tasks.completed_at`, `tasks.status_changed_at`, `notifications`), `docs/04-data-access-and-atomicity.md` (§3.2, §3.3, A18), `docs/05-rbac-and-workflow.md` (§3.2, §5.1, §5.3, §6.2, §6.3), `docs/06-routes-and-actions.md` (§3.5)

## Global Constraints
- Non-members receive `404` (`P3`).
- Archived projects reject mutations with `403 "This project is archived"` (`FR-09 c4`).
- Policy (`canApproveTask` -> `403`) runs before state check (`assertTransitionAllowed` -> `400 "Only tasks in review can be approved"`).
- ApproverNever accepts a client-supplied target status ID; always looks up the default `DONE` status in D1.
- Stale `version` rejects with `409 "This task was changed by someone else. Reload to see the latest version."` and writes zero rows.

## Review Focus
- Approver is the sole assignee (or task has no assignees) -> `notificationRepository.insertManyStmt` returns `null`, `compactBatch` drops `null`, approval succeeds with zero notification rows (`docs/04` §3.2, `docs/09` §3.3).
- Approver is one of multiple assignees -> approval succeeds (`FR-22 c4`), other assignees receive `TASK_APPROVED`, approver does not notify themselves.
- Project `MEMBER` posts approve on a `TODO` task -> receives `403` (policy precedes state check).
- Lead posts approve on a `TODO`, `IN_PROGRESS`, or `DONE` task -> receives `400 "Only tasks in review can be approved"`.
- Forced failure of `outbox_jobs` insert at end of batch A18 -> rolls back `tasks`, `audit_logs`, and `notifications`.

---

### Task 1: Schema, Repository & Service (`@pm/domain`, `@pm/db`, `taskService.approveTask`)

**Files:**
- Modify: `packages/domain/src/schemas/task.ts`
- Modify: `apps/web/app/services/task.service.ts`
- Test: `packages/domain/test/workflow.test.ts`
- Test: `packages/db/test/taskRepository.test.ts`
- Test: `apps/web/test/task/task.service.test.ts`

- [ ] **Step 1: Write failing tests** for `TaskApproveSchema`, `taskRepository.updateStatusStmt` setting `completedAt`, and `taskService.approveTask` (FR-22 c1–4, empty notifications when approver is sole assignee, archived project 403, non-member 404, stale version 409, forced batch failure rollback).
- [ ] **Step 2: Run Vitest and confirm RED.**
- [ ] **Step 3: Implement `TaskApproveSchema`, `taskService.approveTask` (A18 + `TODO(M6-T2): publishNotifications after commit`), and `TaskPermissions.canApprove` / `canReopen` state-aware flags in `getTaskDetails`.**
- [ ] **Step 4: Run Vitest and confirm GREEN.**

### Task 2: Action, UI & Playwright E2E

**Files:**
- Modify: `apps/web/app/actions/taskDetailAction.ts`
- Modify: `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`
- Modify: `apps/web/test/task/taskDetailRoute.test.ts`
- Create: `apps/web/e2e/taskApprove.spec.ts`

- [ ] **Step 1: Write failing route/action tests in `taskDetailRoute.test.ts` (`intent=approve`: FR-22 c1–4, invalid version 400, non-member 404).**
- [ ] **Step 2: Run Vitest and confirm RED.**
- [ ] **Step 3: Implement `intent === "approve"` in `taskDetailAction.ts` (resolving `TODO(M4-T2)`) and render the `Approve Task` button on `_app.projects.$projectId.tasks.$taskId.tsx` when `permissions.canApprove` is true.**
- [ ] **Step 4: Run Vitest to confirm GREEN, write `apps/web/e2e/taskApprove.spec.ts` (member moves task to Review -> lead approves -> status becomes Done, task becomes frozen, sprint completion reflects 100%), verify `git grep "TODO(M4-T2)"` is empty, run full verification, push, PR, and merge.**
