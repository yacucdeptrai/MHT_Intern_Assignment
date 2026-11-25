# Plan: M3-T4 Task Detail Page & Update with Version Guard (A15 / FR-13)

## Goals
Implement task detail view and update functionality with optimistic locking version guard (A15) fulfilling FR-13 criteria 1–4.

## Authority & Specs
- **SRS**: `docs/01-srs.md` FR-13 (Update Task)
  - c1: Allowed editor saves changes with version; task updated, version increments, `TASK_UPDATED` audited with changed fields.
  - c2: Stale version returns 409 "This task was changed by someone else. Reload to see the latest version." and nothing is written.
  - c3: Non-editor project member receives 403 ForbiddenError.
  - c4: Task in `DONE` status rejected with 403 "Reopen the task to edit it" for everyone including leads.
- **Data Access & Atomicity**: `docs/04-data-access-and-atomicity.md` A15
  - `taskService.updateTask`: update `tasks` (version guard); `conflictGuardStmt`; if sprint changed, update `tasks.sprint_id` of sub-tasks (unguarded); insert `audit_logs` `TASK_UPDATED`.
- **RBAC**: `docs/05-rbac-and-workflow.md`
  - `canEditTask`: project lead (PM/TEAM_LEAD/Admin), creator, or assignee; and `task.category !== 'DONE'`.
  - Non-members receive 404 NotFoundError.
  - Archived projects receive 403 ForbiddenError "This project is archived".
- **Routes & Actions**: `docs/06-routes-and-actions.md` §3.5
  - Route: `/projects/:projectId/tasks/:taskId` (`apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`)
  - Intent: `update` with `TaskUpdateSchema` (`title`, `description`, `priority`, `startDate`, `dueDate`, `sprintId`, `version`).
  - Loader: returns task details, assignees, subtasks, audit history, project members, project sprints, permissions (`canEditTask`, etc.).

## TDD Implementation Steps
1. **Domain**:
   - `packages/domain/src/schemas/task.ts`: Define `TaskUpdateSchema` and `TaskDetailDto`.
   - Unit tests in `packages/domain/test/task.schema.test.ts`.
2. **Database Layer**:
   - `packages/db/src/repositories/task.repository.ts`:
     - `updateStmt`: update fields, increment `version = version + 1`, guarded by `where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))`.
     - `updateSubtasksSprintStmt`: update `sprint_id` on subtasks where `parent_task_id = ?` and `deleted_at IS NULL`.
     - `findDetailsById`: fetch task with status, creator, sprint, assignees, and parent task.
   - Tests in `packages/db/test/taskRepository.test.ts`.
3. **Service Layer**:
   - `apps/web/app/services/task.service.ts`:
     - `getTaskDetails`: permission checks, loads task and associated metadata.
     - `updateTask`: validates permission (`canEditTask`), frozen `DONE` check, cross-project sprint validation, date ordering check, atomic batch A15 (`updateStmt` + `conflictGuardStmt` + `updateSubtasksSprintStmt` + `auditLog`), catches conflict and throws `ConflictError`.
   - Unit tests in `apps/web/test/task/task.service.test.ts`.
4. **Web Route, Action, & Loader**:
   - `apps/web/app/loaders/taskDetailLoader.ts`
   - `apps/web/app/actions/taskDetailAction.ts` (`intent: "update"`)
   - `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`: Detail view with edit form, optimistic conflict banner, date pickers, priority selector, sprint dropdown.
   - Tests in `apps/web/test/task/taskDetailRoute.test.ts`.
5. **E2E Playwright Suite**:
   - `apps/web/e2e/taskUpdate.spec.ts`:
     - Successful update increments version and updates fields.
     - 409 conflict when saving with stale version.
     - Non-editor member receives 403.
     - Non-member receives 404.
6. **Pre-commit Quality Checks**:
   - Lint, formatting, typecheck, spellcheck, dependency cycles, unit tests with coverage, build, simulated CI with empty D1.
