# Implementation Plan: M3-T2 Task Creation & Tables (FR-12)

## Goal
Implement `tasks`, `task_assignees`, and `sprints` (schema only) tables, per-project number allocation, task creation service with Atomic Batch A14 (`TASK_CREATED` audit log, `SLACK_POST_TASK` outbox job, `TASK_ASSIGNED` notifications for assigned members), and complete debt A5 (`removeMember` deletes assignments on unarchived tasks, FR-10 c4) and FR-20 c3/c4 (task count checks for status delete/category change).

## Scope & Architectural Requirements
1. **Schema & Migration (`packages/db`)**:
   - `sprints`: `id` (PK), `projectId` (FK -> projects.id), `name`, `startDate`, `endDate`, `createdAt`, `updatedAt`, `deletedAt`, unique constraint on `(id, projectId)`, check `end_date >= start_date`.
   - `tasks`: `id` (PK), `projectId` (FK -> projects.id), `number` (integer), `parentTaskId`, `sprintId`, `statusId` (FK -> taskStatuses.id), `title`, `description`, `priority` (LOW, MEDIUM, HIGH, URGENT), `startDate`, `dueDate`, `createdById` (FK -> users.id), `slackThreadTs`, `statusChangedAt`, `completedAt`, `version` (default 1), `createdAt`, `updatedAt`, `deletedAt`.
     - Constraints: unique `(id, projectId)`, unique `(projectId, number)`, composite FK `(sprintId, projectId) -> sprints(id, projectId)`, composite FK `(parentTaskId, projectId) -> tasks(id, projectId)`, check `start_date IS NULL OR due_date IS NULL OR due_date >= start_date`, check priority enum.
     - Indexes: `idx_tasks_project_status`, `idx_tasks_project_sprint`, `idx_tasks_parent`, `idx_tasks_due` (partial), `idx_tasks_status`, `idx_tasks_project_completed`.
   - `task_assignees`: `taskId` (FK -> tasks.id), `userId` (FK -> users.id), `assignedAt`. Composite PK `(taskId, userId)`, index `idx_task_assignees_user`.
   - Forward-only migration `0008_tasks_and_sprints.sql`.
2. **Repositories (`packages/db`)**:
   - `task.repository.ts`:
     - `insertStmt`: allocates number using `SELECT COALESCE(MAX(number), 0) + 1 FROM tasks WHERE project_id = ?`.
     - `findById`, `findByProjectAndNumber`, `countByStatusId`, `listByProject`.
   - `taskAssignee.repository.ts`:
     - `insertBatchStmt`: statements for inserting assignees.
     - `deleteByMemberOnUnarchivedTasksStmt`: deletes `task_assignees` for `userId` on tasks in `projectId` where `deleted_at IS NULL`.
     - `findByTaskId`.
   - `sprint.repository.ts` (minimal for FK checks):
     - `findById`.
3. **Domain Layer (`packages/domain`)**:
   - `TaskCreateSchema`: `title` (1-200), `description` (optional, <=10000), `priority` (default MEDIUM), `startDate`, `dueDate`, `sprintId`, `parentTaskId`, `assigneeIds` (string array). Date validation: due >= start.
   - Task policy checks: `canCreateTask` (any project member, not archived), `canAssignTask` (lead only).
4. **Service Layer (`apps/web`)**:
   - `task.service.ts`:
     - `createTask`:
       - `loadProjectAccess`: non-member 404, archived project 403 ("This project is archived").
       - Check `canCreateTask`.
       - If `assigneeIds` provided and non-empty: check caller `canAssignTask` (403 if member) and verify each assignee is an active project member.
       - If `sprintId` provided: verify sprint belongs to project and is not archived.
       - Status: select default `TODO` status from `task_statuses`.
       - Batch A14:
         - `taskRepository.insertStmt`
         - `taskAssigneeRepository.insertBatchStmt` (if assignees)
         - `auditLogRepository.insertStmt` (`TASK_CREATED`)
         - `notificationRepository.insertStmt` (`TASK_ASSIGNED` per assignee)
         - `outboxJobRepository.insertStmt` (`SLACK_POST_TASK` for top-level tasks)
       - Return created task.
   - Complete A5 in `projectMember.service.ts`:
     - In `removeMember`: include `taskAssigneeRepository.deleteByMemberOnUnarchivedTasksStmt`.
   - Complete FR-20 c3 & c4 in `taskStatus.service.ts`:
     - In `deleteStatus`: check `countByStatusId`. If > 0, 400 "This status is in use by N tasks".
     - In `updateStatus`: if category changes and `countByStatusId > 0`, 400.
5. **Action & Route (`apps/web`)**:
   - In `/projects/:projectId` route (`_app.projects.$projectId._index.tsx`):
     - Handle `intent === "createTask"` using `TaskCreateSchema`.
     - Return 201 on success.
6. **Testing & Verification**:
   - Repository tests: task insertion, number allocation, race test, composite FK enforcement, delete unarchived assignees.
   - Service tests: A14 batch atomicity, non-member 404, archived project 403, non-lead assignee 403, invalid sprint error.
   - Complete `FR-10 c4` tests in `projectMember.service.test.ts`.
   - Complete FR-20 c3/c4 tests in `taskStatus.service.test.ts`.
   - Action tests in `projectTasksAction.test.ts`.
   - Playwright E2E: member creates task, admin/lead assigns task.
