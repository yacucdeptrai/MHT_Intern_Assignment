# Task Archive Implementation Plan (FR-14 / M3-T6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement task archiving (A20 / FR-14) allowing creator, project TEAM_LEAD, PM, and Admin to archive a task and its sub-tasks atomically with version guarding and audit logging.

**Architecture:** Add `TaskArchiveSchema` in `@pm/domain`, statement builders `archiveWithVersionStmt` and `archiveSubtasksStmt` in `@pm/db`, `taskService.archiveTask` executing atomic batch A20, handle `intent === "archive"` in `taskDetailAction`, and add archive UI on the task detail page.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** docs/01-srs.md (FR-14), docs/04-data-access-and-atomicity.md (A20), docs/05-rbac-and-workflow.md

---

## Acceptance Criteria Mapping
- **FR-14 c1:** Given the creator or a project TEAM_LEAD/PM (or Admin), When they archive a task, Then the task and its sub-tasks are soft deleted together, and `TASK_ARCHIVED` is audited.
- **FR-14 c2:** Given an assignee who is not the creator and holds only the MEMBER project role, When they post archive, Then they receive 403.
- **RBAC & State Invariants:**
  - Non-member access returns 404.
  - Archived project returns 403 "This project is archived".
  - Stale version returns 409 "This task was changed by someone else. Reload to see the latest version."
  - Sub-tasks are archived unguarded (may legitimately touch 0 rows without failing the batch).

---

### Task 1: Domain & DB Layer
- Add `TaskArchiveSchema` in `packages/domain/src/schemas/task.ts`.
- Add `archiveWithVersionStmt` and `archiveSubtasksStmt` in `packages/db/src/repositories/task.repository.ts`.
- Repository tests in `packages/db/test/taskRepository.test.ts`.

### Task 2: Service Layer (A20 Batch)
- Implement `taskService.archiveTask` in `apps/web/app/services/task.service.ts`.
- Batch A20:
  1. `taskRepository.archiveWithVersionStmt`
  2. `conflictGuardStmt(ctx.db)`
  3. `taskRepository.archiveSubtasksStmt` (unguarded)
  4. `auditLogRepository.insertStmt` (`TASK_ARCHIVED`)
- Unit/integration tests in `apps/web/test/task/task.service.test.ts`.

### Task 3: Action, Route & E2E Layer
- Wire `intent === "archive"` in `taskDetailAction.ts`. Redirect to `/projects/${projectId}` on success.
- Add "Archive Task" button with confirmation in `_app.projects.$projectId.tasks.$taskId.tsx` guarded by `permissions.canArchive`.
- Route action tests in `apps/web/test/task/taskDetailRoute.test.ts`.
- Playwright E2E test in `apps/web/e2e/taskArchive.spec.ts` (or `taskUpdate.spec.ts`).
