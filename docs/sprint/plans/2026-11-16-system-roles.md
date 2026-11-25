# Implementation Plan: System Role Assignment (M1-T4)

**Task**: M1-T4 `feature/system-roles`
**Authoritative Requirement**: FR-04 (`docs/01-srs.md`), docs/04 §4 A10, docs/05 §4
**Branch**: `feature/system-roles` (stacked on PR #11)

---

## 1. Requirements & Acceptance Criteria
- **FR-04 Criterion 1**: Given an Admin, When they change a user's system role, Then the new role applies on the user's next request (layout and system rights), and `USER_ROLE_CHANGED` is audited with old and new values.
- **FR-04 Criterion 2**: Given the last remaining Admin, When anyone tries to demote them, Then the request is rejected with 400 "At least one administrator is required".
- **FR-04 Criterion 3**: Given a non-Admin, When they post a role change, Then they receive 403.
- **Self-lockout rule**: An Admin cannot demote themselves ("You cannot change your own access").

---

## 2. Technical Architecture & Layering
1. **Domain Layer**:
   - `SetSystemRoleSchema` in `packages/domain/src/schemas/user.ts` (already defined with `userId` and `systemRole`).
2. **Database & Service Layer**:
   - `userService.setSystemRole(ctx, userId, newRole)`:
     - Checks `canManageUsers(actor)` -> 403 if false.
     - Prevents self-demotion (`actor.userId === userId && newRole !== "ADMIN"`) -> 400.
     - Checks `target.systemRole === "ADMIN" && newRole !== "ADMIN"` -> counts remaining admins via `userRepository.countAdmins`. If `<= 1`, throws 400 "At least one administrator is required".
     - Batch A10: updates `users.system_role` with version guard and inserts `audit_logs` with action `USER_ROLE_CHANGED` and `{ systemRole: { from, to } }`.
   - `userService.updateUser`:
     - When `changes.systemRole` is present and is the sole change, sets audit action to `USER_ROLE_CHANGED`.
3. **Action & Route Layer**:
   - `adminUsersAction`:
     - Handles `intent: "setRole"` and `intent: "update"`.
     - Returns 400 on validation or rule violations, 403 for unauthorized users.
4. **Testing Strategy**:
   - Action tests: `adminUsersAction.test.ts` covers `setRole`, last-Admin rule, non-admin 403, audit log creation.
   - Immediate session effect test: demonstrates that a user whose role was updated receives their new layout/access on their next request.
   - E2E Playwright test: `systemRoles.spec.ts` covers Admin changing a user's role and seeing the updated role badge.
