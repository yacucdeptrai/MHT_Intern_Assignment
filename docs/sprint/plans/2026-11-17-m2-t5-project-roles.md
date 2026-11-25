# Implementation Plan: M2-T5 Project Roles (FR-11)

## 1. Specification & Scope
- **Source**: `docs/01-srs.md` §4.2 FR-11 Assign Project Role, `docs/04-data-access-and-atomicity.md` Batch A6, `docs/05-rbac-and-workflow.md` §2, §4, §5.2.
- **Goal**: Allow Project PM and Admin to update a project member's role (`PM`, `TEAM_LEAD`, `MEMBER`).
- **Acceptance Criteria**:
  1. **FR-11 c1**: Given a project PM, when they change a member's role, then it takes effect on that member's next request, and `MEMBER_ROLE_CHANGED` is audited.
  2. **FR-11 c2**: Given the project's last PM, when anyone demotes them, then the request is rejected as in FR-10 criterion 5 (400 "A project needs at least one PM").
  3. **FR-11 c3**: Given a project TEAM_LEAD or MEMBER, when they post a role change, then they receive 403.
  4. **P3 / Non-member**: Non-members receive 404.
  5. **Archived project**: Rejects role change with 403 "This project is archived".

## 2. Shared Last-PM Rule
- Refactor the last-PM check in `apps/web/app/services/project/projectMember.service.ts` into a shared helper function `assertNotLastPm(db: AppDatabase, projectId: string)`.
- Use `assertNotLastPm` in both `removeMember` (M2-T4) and `changeRole` (M2-T5) so the last-PM rule shares the exact same code rather than duplicating it.

## 3. Atomic Batch A6
- Statements:
  1. `projectMemberRepository.updateRoleStmt(ctx.db, projectId, userId, projectRole)`
  2. `conflictGuardStmt(ctx.db)`
  3. `auditLogRepository.insertStmt(ctx.db, { action: "MEMBER_ROLE_CHANGED", entityType: "PROJECT_MEMBER", entityId: \`${projectId}:${userId}\`, changes: { projectRole: { from: member.projectRole, to: projectRole } } })`
- Guard catches version conflict and raises 409 `ConflictError("Member was modified concurrently")`.

## 4. Testing Plan (TDD)
1. **Unit tests in `apps/web/test/project/projectMember.service.test.ts`**:
   - `assertNotLastPm` shared function unit tests.
   - `FR-11 c1`: changes role, audits `MEMBER_ROLE_CHANGED`.
   - `FR-11 c2`: demoting last PM throws 400 "A project needs at least one PM".
   - `FR-11 c3`: non-lead receives 403 `ForbiddenError`.
   - `FR-11`: archived project rejects role change with 403 `ForbiddenError`.
   - `FR-11`: non-member receives 404 `NotFoundError`.
2. **Route tests in `apps/web/test/project/projectMembersRoute.test.ts`**:
   - `FR-11 c1`: `projectMembersAction` changes role with status 200.
   - `FR-11 c2`: `projectMembersAction` demoting last PM returns 400 "A project needs at least one PM".
   - `FR-11 c3`: `projectMembersAction` by non-lead returns 403.
   - `FR-11`: `projectMembersAction` on archived project returns 403.
   - `FR-11`: `projectMembersAction` by non-member returns 404.
3. **E2E test in `apps/web/e2e/projectRoles.spec.ts`**:
   - PM changes a member's role and verifies the UI updates.
   - PM attempts to demote the last PM and verifies error "A project needs at least one PM".
   - Member sees read-only role badge, cannot change roles.
