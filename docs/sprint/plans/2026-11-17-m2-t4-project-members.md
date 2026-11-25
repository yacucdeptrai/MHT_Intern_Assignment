# Implementation Plan: M2-T4 Project Members (FR-10)

> **Date:** 2026-11-17  
> **Task:** M2-T4 `feature/project-members`  
> **Branch:** `feature/project-members`  
> **Acceptance:** FR-10 criteria 1–6 (A4, A5, A7, notifications table, members page)

---

## 1. Scope & Acceptance Criteria (FR-10)

- **FR-10 c1:** Given a project PM, When they search by name or email, Then only `ACTIVE` users who are not yet members are listed.
- **FR-10 c2:** Given a selected user and a project role, When they add them, Then the membership, a `MEMBER_ADDED` audit entry, and a `PROJECT_MEMBER_ADDED` notification to the added user are written atomically (Batch A4). If already a member, rejects with 400 "Already a member".
- **FR-10 c3:** Given an email with no user account, When the PM invites it, Then an invite carrying the project and role is created with outbox job `EMAIL_INVITE` (Batch A7).
- **FR-10 c4:** Given a project PM, When they remove a member who still has assigned tasks, Then the member is removed, their assignments on unarchived tasks are removed in the same operation, and `MEMBER_REMOVED` is audited (Batch A5).
  - *Note on M2-T4:* `task_assignees` table does not exist until M3-T2. As approved, M2-T4 implements `project_members` delete -> `conflictGuardStmt` -> `audit_logs` `MEMBER_REMOVED`, with code comment `// TODO(M3-T2): add the task_assignees delete for this member's unarchived tasks (A5, FR-10 c4)`. An `it.todo` is added to tests, and PR description notes partial coverage.
- **FR-10 c5:** Given the project's last PM, When anyone tries to remove them or change their role, Then the request is rejected with 400 "A project needs at least one PM".
- **FR-10 c6:** Given a project TEAM_LEAD or MEMBER, When they post a member change, Then they receive 403. Non-members receive 404.

---

## 2. Technical Steps (TDD)

1. **Schema & Migration:**
   - Define `notifications` table in `packages/db/src/schema/notifications.ts` (`id`, `user_id`, `type`, `entity_id`, `project_id`, `payload`, `read_at`, `created_at`).
   - Create migration `packages/db/migrations/0006_notifications.sql` and update `meta/_journal.json`.
   - Export in `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`.
2. **Domain Schemas & DTOs:**
   - `packages/domain/src/schemas/projectMember.ts` (`MemberAddSchema`, `MemberInviteSchema`, `MemberRemoveSchema`, `UserSearchSchema`).
   - `packages/domain/src/types/project.ts` (`MemberRow`, `InviteRow`, `NotificationPayload`).
   - Domain unit tests in `packages/domain/test/projectMember.schema.test.ts`.
3. **Repository Methods:**
   - `notificationRepository` in `packages/db/src/repositories/notification.repository.ts` (`insertStmt`, `insertManyStmt`, `listByUser`).
   - `projectMemberRepository`: `deleteStmt`, `countByProjectAndRole`, `listByProjectWithUser`.
   - `userRepository`: `searchActiveNonMembers`.
   - `inviteRepository`: `listPendingByProject`.
   - Repository unit tests in `packages/db/test/projectMemberRepositories.test.ts` and `notificationRepository.test.ts`.
4. **Service Methods:**
   - `projectMemberService.getProjectMembers(ctx, projectId)`
   - `projectMemberService.searchUsers(ctx, projectId, q)`
   - `projectMemberService.addMember(ctx, projectId, input)` (Batch A4)
   - `projectMemberService.removeMember(ctx, projectId, userId)` (Batch A5)
   - `projectMemberService.inviteMember(ctx, projectId, input)` (Batch A7)
   - Service unit/integration tests in `apps/web/test/project/projectMember.service.test.ts`.
5. **Route, Loader & Action:**
   - `apps/web/app/loaders/projectMembersLoader.ts`
   - `apps/web/app/actions/projectMembersAction.ts` (`intent="add" | "remove" | "invite"`)
   - `apps/web/app/routes/_app.projects.$projectId.members.tsx`
   - Action & loader tests in `apps/web/test/project/projectMembersRoute.test.ts`.
6. **Playwright E2E Tests:**
   - `apps/web/e2e/projectMembers.spec.ts` covering FR-10 c1–c6.
7. **Verification & PR:**
   - Run full pipeline: lint, format, typecheck, spell, deps, vitest --maxWorkers=2, build, CI simulation against empty D1.
   - Commit, push, open PR into `develop`, watch CI until green.
