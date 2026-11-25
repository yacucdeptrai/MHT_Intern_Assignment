# Task Assignment Implementation Plan (FR-15 / M3-T5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement task assignment (A17) allowing project TEAM_LEAD, PM, and Admin to assign/reassign tasks to project members with atomic versioning, notifications to newly assigned members, and audit logging.

**Architecture:** Add `TaskAssignSchema` in `@pm/domain`, repository statements in `@pm/db` (`updateVersionStmt`, `deleteByTaskIdStmt`), `assignTask` service method in `task.service.ts` executing atomic batch A17 with `conflictGuardStmt`, action handling in `taskDetailAction.ts`, and assignment UI in `_app.projects.$projectId.tasks.$taskId.tsx`.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** docs/01-srs.md (FR-15), docs/04-data-access-and-atomicity.md (A17), docs/05-rbac-and-workflow.md

---

## Acceptance Criteria Mapping
- **FR-15 c1:** Given a project TEAM_LEAD or PM (or Admin), When they set the assignees, Then the assignee set is replaced atomically, `TASK_ASSIGNED` is audited, and each newly added assignee receives a `TASK_ASSIGNED` notification.
- **FR-15 c2:** Given a user who is not a member of the project, When they are submitted as an assignee, Then the request is rejected with 400 "Assignees must be project members".
- **FR-15 c3:** Given a project MEMBER, When they post an assignment, Then they receive 403.
- **RBAC & State Invariants:**
  - Non-member access returns 404.
  - Archived project returns 403 "The project is archived".
  - Concurrent edit with stale version returns 409 "This task was changed by someone else. Reload to see the latest version."

---

### Task 1: Domain & DB Layer
- Add `TaskAssignSchema` and `TaskAssignInput` in `packages/domain/src/schemas/task.ts`. Export in `packages/domain/src/index.ts`.
- Add `updateVersionStmt` in `packages/db/src/repositories/task.repository.ts`.
- Add `deleteByTaskIdStmt` in `packages/db/src/repositories/taskAssignee.repository.ts`.
- Tests in `packages/db/test/taskRepository.test.ts`.

### Task 2: Service Layer (A17 Batch)
- Implement `taskService.assignTask` in `apps/web/app/services/task.service.ts`.
- Atomic batch A17:
  1. `taskRepository.updateVersionStmt`
  2. `conflictGuardStmt(ctx.db)`
  3. `taskAssigneeRepository.deleteByTaskIdStmt`
  4. `taskAssigneeRepository.insertBatchStmt`
  5. `auditLogRepository.insertStmt` (action: `TASK_ASSIGNED`)
  6. `notificationRepository.insertStmt` (new assignees only, `TASK_ASSIGNED`)
- Integration tests in `apps/web/test/task/task.service.test.ts` for FR-15 c1, c2, c3, version conflict 409, archived project 403.

### Task 3: Action & Route Layer
- Wire `intent === "assign"` in `apps/web/app/actions/taskDetailAction.ts`. Remove TODO(M3-T5).
- Add assign UI controls in `_app.projects.$projectId.tasks.$taskId.tsx` guarded by `permissions.canAssign`.
- Route action tests in `apps/web/test/task/taskDetailRoute.test.ts`.
- Add task detail assignment test in E2E spec.
