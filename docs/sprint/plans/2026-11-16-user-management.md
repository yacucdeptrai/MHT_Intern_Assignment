# Milestone M1-T2: User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement administrative user management: schema and forward migration for `audit_logs`, `invites`, and `projects` (schema only); `inviteRepository`, `auditLogRepository`, and `userRepository` extensions; `canManageUsers` policy; `userService` with atomic batch operations A9 (create user + invite + audit) and A10 (update, lock, unlock, soft-delete + guard + audit); no-self-lockout rules; and `/admin/users` route with loader, actions, and management UI.

**Architecture:** Layered clean architecture adhering strictly to AGENTS.md. `@pm/domain` provides user management schemas, enums, DTO types, and pure `canManageUsers` policy. `@pm/db` provides schema definitions for `projects`, `invites`, `audit_logs`, SQL migration `0002_user_management.sql`, and repository statement builders with injected `db`. `@pm/web` provides `userService` (orchestrating atomic `db.batch` writes with version guards), route loader & action handlers, and the `/admin/users` UI.

**Tech Stack:** React Router v8 framework mode on Cloudflare Workers, Cloudflare D1 (SQLite), Drizzle ORM, Web Crypto (token generation and SHA-256 hashing), Zod, Ant Design, Tailwind CSS, Vitest, Playwright.

**Spec:** [`docs/01-srs.md` §4.1 (FR-03)](file:///D:/MHT_Intern_Assignment/docs/01-srs.md), [`docs/03-database-design.md` §3 & §4](file:///D:/MHT_Intern_Assignment/docs/03-database-design.md), [`docs/04-data-access-and-atomicity.md` §4 (A9, A10)](file:///D:/MHT_Intern_Assignment/docs/04-data-access-and-atomicity.md), [`docs/05-rbac-and-workflow.md` §3 & §5](file:///D:/MHT_Intern_Assignment/docs/05-rbac-and-workflow.md), [`docs/06-routes-and-actions.md` §3.3](file:///D:/MHT_Intern_Assignment/docs/06-routes-and-actions.md), [`docs/10-implementation-roadmap.md` §M1-T2](file:///D:/MHT_Intern_Assignment/docs/10-implementation-roadmap.md).

---

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters; no AI metadata, bot tags, or `Co-authored-by:` trailers.
- All repository methods MUST accept an injected `db: AppDatabase` as their first parameter. No global database client.
- Atomic multi-row operations MUST execute in a single `db.batch([...])`. Conditional updates (A10) must be immediately followed by `conflictGuardStmt(db)`.
- Input validation: action boundaries validate data with Zod `safeParse`.
- Zero tolerance for uncontrolled `any` or `@ts-ignore`.
- Unauthenticated requests bounce to `/login?redirectTo=...`; non-admins accessing `/admin/users` receive 403 `ForbiddenError`.
- Self-lockout prevention: an Admin cannot lock, delete, or demote themselves.
- Working branch: `feature/user-management` branched from `develop`.

## Review Focus

1. **Email Uniqueness & Case Insensitivity:** Creating or updating a user with an email already taken (regardless of case) must return a 400 field error "Email is already in use" and preserve form inputs.
2. **Atomic Batch Guarantee (A9):** Creating a user must insert `users`, insert `invites` (with SHA-256 hashed 32-byte token and 7-day expiration), and insert `audit_logs` (`USER_CREATED`) in a single `db.batch`. A failure in any statement rolls back all changes.
3. **Optimistic Version Guard (A10):** Mutating an existing user (update, lock, unlock, soft delete) must run through `db.batch` with `conflictGuardStmt`. If the user was concurrently deleted or does not exist, the guard fails and nothing commits.
4. **Immediate Session Invalidation on Lock / Delete:** When an admin locks or soft-deletes an active user, that user's next request to `requireUser` must destroy their session and redirect to `/login`.
5. **No Self-Lockout:** An admin attempting to lock, delete, or demote their own account must be rejected with 400 "You cannot change your own access".

---

## Tasks

### Task 1: Domain Enums, Policies, Types, and User Schemas

**Files:**
- Modify: `packages/domain/src/enums.ts`
- Create: `packages/domain/src/policies/types.ts`
- Create: `packages/domain/src/policies/user.ts`
- Create: `packages/domain/src/schemas/user.ts`
- Create: `packages/domain/src/types/audit.ts`
- Create: `packages/domain/src/types/invite.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/user.schema.test.ts`
- Test: `packages/domain/test/user.policy.test.ts`

**Interfaces:**
- Produces:
  - Enums: `AUDIT_ENTITY_TYPES`, `AUDIT_ACTIONS`, `NOTIFICATION_TYPES`, `OUTBOX_JOB_TYPES`, `OUTBOX_JOB_STATUSES`, `REMINDER_KINDS`, `OAUTH_PROVIDERS`
  - Policy: `canManageUsers(actor: ActorContext): boolean`
  - Schemas: `UserBaseSchema`, `UserCreateSchema`, `UserUpdateSchema`, `UserIdSchema`, `SetSystemRoleSchema`, `UserFiltersSchema`
  - Types: `UserAdminRow`, `AuditLogEntry`, `InviteDto`, `Page<T>`

- [ ] **Step 1: Write failing domain tests for user schemas and policies**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement domain enums, types, policies, and schemas**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit `feat(domain): add user management schemas, policies, and audit enums`**

---

### Task 2: Database Schemas (`audit_logs`, `invites`, `projects`) and Migration

**Files:**
- Create: `packages/db/src/schema/projects.ts`
- Create: `packages/db/src/schema/invites.ts`
- Create: `packages/db/src/schema/auditLogs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0002_user_management.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: `packages/db/test/userManagementSchema.test.ts`

**Interfaces:**
- Produces Drizzle tables: `projects`, `invites`, `auditLogs` with all documented CHECK constraints and indexes.

- [ ] **Step 1: Write failing test verifying Drizzle table definitions and constraints**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement schemas and migration `0002_user_management.sql`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit `feat(db): add projects, invites, and audit_logs schemas and migration`**

---

### Task 3: Repositories (`inviteRepository`, `auditLogRepository`, `userRepository` extensions)

**Files:**
- Create: `packages/db/src/repositories/invite.repository.ts`
- Create: `packages/db/src/repositories/auditLog.repository.ts`
- Modify: `packages/db/src/repositories/user.repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/userManagementRepositories.test.ts`

**Interfaces:**
- Injected `db: AppDatabase` methods:
  - `userRepository.updateStmt`, `softDeleteStmt`, `setStatusStmt`, `setSystemRoleStmt`, `listUsers`, `countAdmins`
  - `inviteRepository.insertStmt`, `findById`, `findByTokenHash`
  - `auditLogRepository.insertStmt`, `findById`, `listByEntity`

- [ ] **Step 1: Write failing repository integration tests on local D1**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement repositories**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit `feat(db): add invite, auditLog repositories and user repository mutations`**

---

### Task 4: User Management Service Layer (Atomic Batches A9 & A10, No-Self-Lockout)

**Files:**
- Create: `apps/web/app/services/user/user.service.ts`
- Create: `apps/web/app/services/user/index.ts`
- Test: `apps/web/test/user/user.service.test.ts`

**Interfaces:**
- Functions:
  - `userService.createUser(ctx, input)` (A9: users + invites + audit_logs)
  - `userService.updateUser(ctx, input)` (A10: users + guard + audit_logs)
  - `userService.lockUser(ctx, userId)` (A10: users + guard + audit_logs)
  - `userService.unlockUser(ctx, userId)` (A10: users + guard + audit_logs)
  - `userService.deleteUser(ctx, userId)` (A10: users + guard + audit_logs)
  - `userService.setSystemRole(ctx, userId, systemRole)` (A10: users + guard + audit_logs with last-Admin check)
  - `userService.listUsers(ctx, filters)`

- [ ] **Step 1: Write failing service unit & atomicity tests (A9, A10, FR-03 c1-c6)**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `userService`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit `feat(web): implement user management service with atomic batches A9 and A10`**

---

### Task 5: Web Layer: Loader, Action, and `/admin/users` Route & UI

**Files:**
- Create: `apps/web/app/loaders/adminUsersLoader.ts`
- Create: `apps/web/app/actions/adminUsersAction.ts`
- Create: `apps/web/app/routes/admin.users.tsx`
- Test: `apps/web/test/user/adminUsersAction.test.ts`
- Test: `apps/web/test/user/adminUsersLoader.test.ts`
- Test: `apps/web/e2e/adminUsers.spec.ts`

**Interfaces:**
- Loader: validates user has `canManageUsers` permission; fetches paginated users with filters
- Action: handles intents (`create`, `update`, `lock`, `unlock`, `delete`, `setRole`) using Zod schemas
- UI: `/admin/users` management table, create user modal with invite link copy, edit modal, lock/unlock and delete actions

- [ ] **Step 1: Write failing action & loader tests**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement loader, action, and route component**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Write Playwright E2E test verifying admin user management journey**
- [ ] **Step 6: Run E2E test to verify it passes**
- [ ] **Step 7: Commit `feat(web): add /admin/users loader, action, route, and UI`**

---

### Task 6: Full Verification, Pre-Push CI Simulation, and PR Creation

- [ ] Run full local suite: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm spell && pnpm deps:check && pnpm test:coverage && pnpm build && pnpm test:e2e`
- [ ] Simulate CI: move `apps/web/.wrangler/state` aside, build `.dev.vars` from `.dev.vars.example`, run `CI=1 pnpm test:e2e`, then restore.
- [ ] Push `feature/user-management` to origin.
- [ ] Open PR into `develop` with standard template and `--assignee @me`.
- [ ] Watch CI (`gh run list --commit <sha>`) until all checks pass green.
- [ ] Fast-forward local `develop`.
- [ ] Update `docs/wbs.md` task row.
