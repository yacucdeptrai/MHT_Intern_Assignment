# Milestone M1-T1: Authentication and Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the foundational authentication subsystem: `users` database table and migrations, user repository with injected DB, session cookie management, per-request `RequestContext` and `requireUser` authentication guard, PBKDF2 credential verification, admin bootstrap seed, and `/login` / `/logout` routes.

**Architecture:** A layered clean architecture across monorepo packages. `@pm/domain` provides pure `LoginSchema` and domain error classes. `@pm/db` provides the D1 `users` schema, SQL migration, and `userRepository` with injected `db`. `@pm/web` provides server session management, structured request context, `authService`, action/loader handlers, and React Router v8 flat routes with Ant Design and Tailwind CSS.

**Tech Stack:** React Router v8 (framework mode on Cloudflare Workers), Cloudflare D1 (SQLite), Drizzle ORM, Web Crypto PBKDF2-SHA256, Zod, Ant Design, Tailwind CSS, Vitest, Playwright.

**Spec:** [`docs/01-srs.md` §4.1 (FR-01)](file:///D:/MHT_Intern_Assignment/docs/01-srs.md), [`docs/02-architecture.md` §4](file:///D:/MHT_Intern_Assignment/docs/02-architecture.md), [`docs/03-database-design.md` §3](file:///D:/MHT_Intern_Assignment/docs/03-database-design.md), [`docs/05-rbac-and-workflow.md` §1 & §4](file:///D:/MHT_Intern_Assignment/docs/05-rbac-and-workflow.md), [`docs/06-routes-and-actions.md` §3.1](file:///D:/MHT_Intern_Assignment/docs/06-routes-and-actions.md), [`docs/10-implementation-roadmap.md` §M1-T1](file:///D:/MHT_Intern_Assignment/docs/10-implementation-roadmap.md).

---

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters; no AI metadata, bot tags, or `Co-authored-by:` trailers.
- All repository methods MUST accept an injected `db: AppDatabase` as their first parameter. No global database instances.
- Zero tolerance for uncontrolled `any` or `@ts-ignore`.
- Input validation: all action inputs must be validated with Zod `safeParse`.
- Case sensitivity: `users.email` is stored lowercase with `COLLATE NOCASE`.
- Route guards: unauthenticated requests MUST redirect to `/login?redirectTo=<current_path>` (never silently to `/`).
- Errors: Never use the comma operator with `throw` (`throw new AppError(...)`, not `throw (new AppError(...), 403)`).
- Working branch: `feature/auth-login` branched from `develop`.

## Review Focus

1. **Email case normalization & whitespace trimming**: A user typing ` User@Example.COM ` must successfully authenticate against a stored `user@example.com` record.
2. **Open redirect prevention**: A malicious login attempt with `?redirectTo=https://evil.com` or `//evil.com` must be rejected and redirected safely to the user's home layout.
3. **Locked & soft-deleted account eviction**: If an administrator marks a user `LOCKED` or sets `deleted_at`, the user's very next request must immediately invalidate the session and bounce to `/login`.
4. **Form state retention on failed login**: When login fails with invalid credentials, the email field must retain the user's entered text while the password field clears.
5. **Session cookie security flags**: Session cookies must be configured with `httpOnly: true`, `secure: true` (in non-local envs), `sameSite: "lax"`, and maxAge 7 days (`SESSION_MAX_AGE_S`).

---

## Tasks

### Task 1: Domain Errors, Types, and Login Zod Schema

**Files:**
- Create: `packages/domain/src/errors.ts`
- Create: `packages/domain/src/schemas/auth.ts`
- Create: `packages/domain/src/types/user.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/auth.schema.test.ts`
- Test: `packages/domain/test/errors.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_ROLES`, `USER_STATUSES` from `packages/domain/src/enums.ts`
- Produces:
  - `LoginSchema` (`z.infer<typeof LoginSchema>`)
  - `SessionUser` interface (`id`, `email`, `fullName`, `systemRole`, `status`)
  - `AppError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`

- [ ] **Step 1: Write the failing domain tests**
  - Create `packages/domain/test/auth.schema.test.ts` testing `LoginSchema` parsing, valid emails, lowercase normalization/trim, password requirements, and optional `redirectTo`.
  - Create `packages/domain/test/errors.test.ts` verifying error classes have standard `name`, `message`, and numeric `status`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/domain test`
  Expected: FAIL (modules not found)

- [ ] **Step 3: Implement domain types, error hierarchy, and LoginSchema**
  - Implement `packages/domain/src/errors.ts` with `AppError` base class and standard subclasses.
  - Implement `packages/domain/src/types/user.ts` with `SessionUser`.
  - Implement `packages/domain/src/schemas/auth.ts` with `LoginSchema`.
  - Re-export them from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/domain test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/domain
  git commit -m "feat(domain): add auth schema, user types, and domain error hierarchy"
  ```

---

### Task 2: Database Schema & Migration for `users` Table

**Files:**
- Create: `packages/db/src/schema/users.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0001_users.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: `packages/db/test/usersSchema.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_ROLES`, `USER_STATUSES` from `@pm/domain`
- Produces:
  - `users` table export and types `User`, `NewUser`
  - Migration `0001_users.sql`

- [ ] **Step 1: Write the failing database migration and schema test**
  - Create `packages/db/test/usersSchema.test.ts` asserting that `users` table exists, accepts a valid insert with `id`, `email`, `fullName`, `systemRole`, `status`, `passwordHash`, `passwordIterations`, enforces unique case-insensitive email, and enforces the `(password_hash IS NULL) = (password_iterations IS NULL)` check constraint.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/db test`
  Expected: FAIL

- [ ] **Step 3: Implement Drizzle table and SQL migration**
  - Create `packages/db/src/schema/users.ts` with `sqliteTable("users", ...)` declaring columns per `docs/03-database-design.md`:
    - `id`: text PK
    - `email`: text not null collate nocase unique
    - `fullName`: text("full_name").notNull()
    - `phone`: text("phone")
    - `department`: text("department")
    - `avatarKey`: text("avatar_key")
    - `passwordHash`: text("password_hash")
    - `passwordIterations`: integer("password_iterations")
    - `systemRole`: text("system_role", { enum: SYSTEM_ROLES }).notNull().default("MEMBER")
    - `status`: text("status", { enum: USER_STATUSES }).notNull().default("ACTIVE")
    - `createdAt`: integer("created_at", { mode: "timestamp_ms" }).notNull()
    - `updatedAt`: integer("updated_at", { mode: "timestamp_ms" }).notNull()
    - `deletedAt`: integer("deleted_at", { mode: "timestamp_ms" })
  - Add check constraints and unique index `uq_users_email`.
  - Create `packages/db/migrations/0001_users.sql` with matching SQL and check constraints.
  - Update `packages/db/src/schema/index.ts` to export `users`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/db test`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/db
  git commit -m "feat(db): add users table schema and migration"
  ```

---

### Task 3: User Repository Layer with Injected `db`

**Files:**
- Create: `packages/db/src/repositories/user.repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/userRepository.test.ts`

**Interfaces:**
- Consumes: `AppDatabase` from `packages/db/src/client.ts`, `users` schema
- Produces: `userRepository` methods:
  - `findById(db: AppDatabase, id: string, options?: { includeDeleted?: boolean })`
  - `findByEmail(db: AppDatabase, email: string, options?: { includeDeleted?: boolean })`
  - `hasAdminUser(db: AppDatabase): Promise<boolean>`
  - `insert(db: AppDatabase, user: NewUser): Promise<User>`
  - `updatePassword(db: AppDatabase, id: string, hash: string, iterations: number, now: Date): Promise<void>`

- [ ] **Step 1: Write the failing repository unit tests**
  - Create `packages/db/test/userRepository.test.ts` testing `insert`, `findByEmail` (case-insensitive), `findById` (filtering soft-deleted by default unless `includeDeleted: true`), and `hasAdminUser`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/db test test/userRepository.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `userRepository`**
  - Implement `packages/db/src/repositories/user.repository.ts` following strict repository conventions (takes injected `db`, queries Drizzle table, filters `deletedAt IS NULL` by default).
  - Export from `packages/db/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/db test test/userRepository.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/db
  git commit -m "feat(db): implement userRepository with injected database handle"
  ```

---

### Task 4: Request Context, Logger, and Session Infrastructure

**Files:**
- Create: `apps/web/app/utils/logger.server.ts`
- Create: `apps/web/app/utils/session.server.ts`
- Create: `apps/web/app/utils/requestContext.server.ts`
- Create: `apps/web/app/utils/auth.server.ts`
- Create: `apps/web/app/utils/errors.server.ts`
- Modify: `apps/web/worker/index.ts`
- Test: `apps/web/test/auth/session.test.ts`
- Test: `apps/web/test/utils/requestContext.test.ts`

**Interfaces:**
- Consumes: `SessionUser` from `@pm/domain`, `createDatabase` from `@pm/db`, `SESSION_SECRET` from Worker `env`
- Produces:
  - `createRequestContext(env, executionCtx, request): RequestContext`
  - `requestContextKey` for React Router context
  - `getSession(request)`, `commitSession(session)`, `destroySession(session)`
  - `requireUser(ctx, request): Promise<SessionUser>`
  - `getSafeRedirect(target: string | null | undefined, defaultUrl?: string): string`
  - `handleActionError(error: unknown, ctx?: RequestContext): Response`

- [ ] **Step 1: Write the failing session and auth utility tests**
  - Create `apps/web/test/auth/session.test.ts` testing session cookie serialization, TTL, and `getSafeRedirect` against open redirects (`//evil.com`, `https://attacker.com`).
  - Test `requireUser` with valid session (returns user), missing session (redirects to `/login?redirectTo=...`), and locked/deleted user (destroys session and redirects to `/login`).

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/web test test/auth/session.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement session management, RequestContext, and Worker integration**
  - Implement `apps/web/app/utils/logger.server.ts` structured JSON logger (fields: level, msg, requestId, userId, durationMs, error).
  - Implement `apps/web/app/utils/session.server.ts` using `createCookieSessionStorage` with `SESSION_SECRET` and `SESSION_MAX_AGE_S`.
  - Implement `apps/web/app/utils/requestContext.server.ts` with `requestContextKey` and `createRequestContext`.
  - Implement `apps/web/app/utils/auth.server.ts` with `requireUser`, `getOptionalUser`, and `getSafeRedirect`.
  - Implement `apps/web/app/utils/errors.server.ts` with `handleActionError` mapping domain errors to JSON responses.
  - Wire `RouterContextProvider` into `apps/web/worker/index.ts` to attach `requestContextKey`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/web test test/auth/session.test.ts test/utils/requestContext.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): implement requestContext, session storage, and requireUser guard"
  ```

---

### Task 5: Auth Service & Admin Bootstrap Seed

**Files:**
- Create: `apps/web/app/services/auth/auth.service.ts`
- Modify: `apps/web/app/services/auth/index.ts`
- Test: `apps/web/test/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `userRepository`, `verifyPassword`, `hashPassword`, `needsRehash`, `RequestContext`
- Produces:
  - `authService.loginWithPassword(ctx, { email, password })`
  - `authService.seedAdminUser(ctx)`

- [ ] **Step 1: Write the failing auth service tests**
  - Create `apps/web/test/auth/auth.service.test.ts` testing:
    - Successful login with matching credentials.
    - Password re-hash trigger when `stored.iterations < PBKDF2_DEFAULT_ITERATIONS`.
    - Failed login on non-existent email (throws 400 generic error "Email or password is incorrect").
    - Failed login on bad password (throws 400 generic error "Email or password is incorrect").
    - Locked account rejection (throws 400 "This account is locked. Contact an administrator.").
    - Deleted account rejection (treated as locked or non-existent).
    - `seedAdminUser` creating the admin user when none exists.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/web test test/auth/auth.service.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `authService`**
  - Implement `apps/web/app/services/auth/auth.service.ts`:
    - `loginWithPassword`: look up user by lowercase email via `userRepository.findByEmail(ctx.db, email)`. If missing or deleted, throw `ValidationError("Email or password is incorrect")`.
    - If status is `LOCKED`, throw `ValidationError("This account is locked. Contact an administrator.")`.
    - If `user.passwordHash` is null, throw `ValidationError("Email or password is incorrect")`.
    - Verify with `verifyPassword`. If invalid, throw `ValidationError("Email or password is incorrect")`.
    - If `needsRehash`, re-hash and call `userRepository.updatePassword`.
    - Return `SessionUser`.
    - `seedAdminUser`: if `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are present, check `userRepository.hasAdminUser(ctx.db)`. If false, hash password and insert admin user with `system_role = 'ADMIN'`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/web test test/auth/auth.service.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/app/services/auth apps/web/test/auth
  git commit -m "feat(web): add authService with credential verification and admin seed"
  ```

---

### Task 6: Login and Logout Routes, Loaders, and Actions

**Files:**
- Create: `apps/web/app/loaders/loginLoader.ts`
- Create: `apps/web/app/actions/loginAction.ts`
- Create: `apps/web/app/actions/logoutAction.ts`
- Create: `apps/web/app/routes/login.tsx`
- Create: `apps/web/app/routes/logout.tsx`
- Test: `apps/web/test/auth/loginAction.test.ts`
- Test: `apps/web/test/auth/logoutAction.test.ts`

**Interfaces:**
- Consumes: `authService`, `LoginSchema`, `getSession`, `commitSession`, `destroySession`, `getSafeRedirect`
- Produces:
  - Route `/login` with full form UI, validation, and error display.
  - Route `/logout` with session destruction.

- [ ] **Step 1: Write the failing action and loader contract tests**
  - Create `apps/web/test/auth/loginAction.test.ts` testing:
    - Invalid schema / missing fields -> 400 with field errors.
    - Invalid credentials -> 400 with form error, retaining entered email.
    - Locked account -> 400 with specific locked message.
    - Success -> sets `Set-Cookie` header with session cookie and redirects to `/admin` (for ADMIN/PM) or safe `redirectTo`.
  - Create `apps/web/test/auth/logoutAction.test.ts` testing POST to `/logout` clears session cookie and redirects to `/login`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @pm/web test test/auth/loginAction.test.ts test/auth/logoutAction.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement loader, action, and UI for login & logout**
  - Implement `apps/web/app/loaders/loginLoader.ts`: redirects already signed-in users to home; returns `{ redirectTo }`.
  - Implement `apps/web/app/actions/loginAction.ts`: parses form with `LoginSchema`, calls `authService.loginWithPassword`, commits session cookie, returns redirect.
  - Implement `apps/web/app/actions/logoutAction.ts`: destroys session cookie, returns redirect to `/login`.
  - Implement `apps/web/app/routes/login.tsx`: UI with clean layout, Ant Design form styling or Tailwind classes, email and password inputs, error alert, submitting state.
  - Implement `apps/web/app/routes/logout.tsx`: simple action export and redirect.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @pm/web test test/auth/loginAction.test.ts test/auth/logoutAction.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): implement login and logout routes, loaders, and actions"
  ```

---

### Task 7: Full Verification, Seed Hook, and E2E Auth Journey

**Files:**
- Modify: `apps/web/worker/index.ts` (run admin seed on first fetch if needed or in setup)
- Create: `apps/web/e2e/auth.spec.ts`
- Modify: `apps/web/test/factories.ts` (add `createUser` factory)
- Test: Full monorepo verification (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm spell`, `pnpm deps:check`)

- [ ] **Step 1: Write E2E login/logout journey test in Playwright**
  - Implement `apps/web/e2e/auth.spec.ts` covering:
    - Attempting unauthenticated access to a protected route redirects to `/login?redirectTo=...`.
    - Logging in with wrong password shows error message and retains email.
    - Logging in with seeded admin credentials redirects to `/admin`.
    - Logging out redirects to `/login`.

- [ ] **Step 2: Run all unit and integration tests across the monorepo**
  Run: `pnpm test`
  Expected: All tests pass across `@pm/domain`, `@pm/db`, and `@pm/web`.

- [ ] **Step 3: Run repository-wide linters, typecheck, and spellcheck**
  Run: `pnpm lint && pnpm typecheck && pnpm spell && pnpm deps:check`
  Expected: Clean exit code 0, 0 warnings, 0 errors.

- [ ] **Step 4: Commit and finalize task**
  ```bash
  git add .
  git commit -m "test(auth): add e2e login journey and monorepo test coverage"
  ```
