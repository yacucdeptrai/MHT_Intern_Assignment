# M3-T1 Status Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `task_statuses` table with seed data and the `/admin/statuses` page (create, rename, reorder, set default A25, delete A26).

**Architecture:** New migration for `task_statuses` with CHECK constraints and partial unique index. Repository + service + action/loader + route following the existing clean-architecture pattern. Seed script for the 4 default statuses.

**Tech Stack:** Drizzle ORM schema, D1 migration, Vitest + `@cloudflare/vitest-plugin`, Zod schemas, React Router route.

**Spec:** [docs/01-srs.md FR-20](file:///D:/MHT_Intern_Assignment/docs/01-srs.md), [docs/03-database-design.md task_statuses](file:///D:/MHT_Intern_Assignment/docs/03-database-design.md), [docs/04-data-access-and-atomicity.md A25/A26](file:///D:/MHT_Intern_Assignment/docs/04-data-access-and-atomicity.md), [docs/05-rbac-and-workflow.md §6.4](file:///D:/MHT_Intern_Assignment/docs/05-rbac-and-workflow.md)

## Global Constraints

- Every repository method takes `db: AppDatabase` as its first parameter.
- Multi-row writes go in `db.batch([...])` with `conflictGuardStmt` right after each conditional write.
- Zod `safeParse` at the action boundary.
- Migrations are forward-only; include CHECK constraints and indexes.
- All test names include criterion IDs copied from the SRS.
- Non-Admin users get 403 on status management (FR-20 c5).
- Error messages use exact SRS wording.

## Review Focus

1. **Partial unique index `uq_task_statuses_default`** must enforce exactly one default per category — test setting a second default.
2. **Reorder with invalid or missing IDs** — the action should reject partial reorder lists that could leave gaps.
3. **Delete while a concurrent task create uses the status** — the guard in A26 must prevent deletion.
4. **Category change with tasks present** — must check archived tasks too.
5. **Empty category after a default delete** — the service must reject deleting the default.

---

### Task 1: Schema, Migration, and Seed

**Files:**
- Create: `packages/db/src/schema/taskStatuses.ts`
- Modify: `packages/db/src/schema/index.ts` (add export)
- Create: `packages/db/migrations/0007_task_statuses.sql`
- Modify: `packages/db/seed/seed.ts` (add status seeding)

**Interfaces:**
- Produces: `taskStatuses` table schema, `TaskStatus` type, `NewTaskStatus` type

- [ ] **Step 1: Create the Drizzle schema `packages/db/src/schema/taskStatuses.ts`**

  Columns: `id` (text PK), `name` (text NN, COLLATE NOCASE), `category` (text NN, CHECK IN StatusCategory), `position` (integer NN), `isDefault` (integer mode boolean NN, default 0), `createdAt` (integer timestamp_ms NN), `updatedAt` (integer timestamp_ms NN).
  
  Constraints from docs/03: unique index on `name`, partial unique index `uq_task_statuses_default` on `(category) WHERE is_default = 1`, CHECK on category values.

- [ ] **Step 2: Export from `packages/db/src/schema/index.ts`**

- [ ] **Step 3: Generate and review migration**

  Run: `pnpm db:generate`
  Review the SQL, add CHECK constraints and partial index if Drizzle didn't emit them.

- [ ] **Step 4: Apply migration locally**

  Run: `pnpm db:migrate:local`

- [ ] **Step 5: Add status seeding to `packages/db/seed/seed.ts`**

  Seed the 4 default statuses from docs/03 §7: `To Do` (TODO, default, pos 1), `In Progress` (IN_PROGRESS, default, pos 2), `Review` (REVIEW, default, pos 3), `Done` (DONE, default, pos 4).

- [ ] **Step 6: Run seed and verify**

  Run: `pnpm db:seed:local`

- [ ] **Step 7: Commit**

  `feat(status): add task_statuses schema, migration, and seed`

### Task 2: Repository

**Files:**
- Create: `packages/db/src/repositories/taskStatus.repository.ts`
- Modify: `packages/db/src/index.ts` (add export)

**Interfaces:**
- Consumes: `taskStatuses` schema (Task 1)
- Produces: `taskStatusRepository` with methods: `findById`, `list`, `countTasksByStatusId`, `insertStmt`, `updateStmt`, `reorderStmt`, `clearDefaultStmt`, `setDefaultStmt`, `deleteStmt`

- [ ] **Step 1: Write repository integration tests**

  Test file: `packages/db/test/taskStatus.repository.test.ts`
  - `list` returns all statuses ordered by position
  - `countTasksByStatusId` returns 0 when no tasks exist (tasks table doesn't exist yet — test with 0)
  - `insertStmt` respects unique name constraint (COLLATE NOCASE)
  - `deleteStmt` with guard pattern — deletes only unused, non-default statuses
  - `EXPLAIN QUERY PLAN` for list uses index

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `taskStatusRepository`**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

  `feat(status): add taskStatus repository`

### Task 3: Domain Schemas and Policy

**Files:**
- Create: `packages/domain/src/schemas/status.ts`
- Modify: `packages/domain/src/policies/user.ts` (add `canManageStatuses`)
- Modify: `packages/domain/src/index.ts` (add exports)

**Interfaces:**
- Produces: `StatusCreateSchema`, `StatusUpdateSchema`, `StatusReorderSchema`, `StatusIdSchema`, `canManageStatuses`

- [ ] **Step 1: Write domain unit tests**

  Test file: `packages/domain/test/schemas/status.test.ts`
  - `StatusCreateSchema` accepts `{ name: "Open", category: "TODO" }`
  - Rejects empty name, name > 50 chars, invalid category
  - `StatusUpdateSchema` accepts partial with `statusId`
  - `canManageStatuses` returns true for Admin, false for all others

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement schemas and policy**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

  `feat(status): add status Zod schemas and canManageStatuses policy`

### Task 4: Service Layer

**Files:**
- Create: `apps/web/app/services/taskStatus.service.ts`

**Interfaces:**
- Consumes: `taskStatusRepository`, `auditLogRepository`, `conflictGuardStmt`, `canManageStatuses`
- Produces: `createStatus`, `updateStatus`, `reorderStatuses`, `setDefault`, `deleteStatus`, `listStatuses`

- [ ] **Step 1: Write service integration tests**

  Test file: `apps/web/test/status/taskStatus.service.test.ts`
  
  Tests named with criterion IDs:
  - `FR-20 c1: creates a status with name and category`
  - `FR-20 c1: rejects duplicate name (case-insensitive)`
  - `FR-20 c2: renames a status`
  - `FR-20 c2: reorders statuses`
  - `FR-20 c2 / A25: sets a new default, clearing the old one atomically`
  - `FR-20 c3: rejects deleting a status used by tasks` (deferred — no tasks table yet; TODO(M3-T2))
  - `FR-20 c4: rejects changing category when tasks use the status` (deferred — TODO(M3-T2))
  - `FR-20 c5: non-Admin gets 403`
  - `A26: deleteStatus guard prevents deletion if a task started using it concurrently` (deferred — TODO(M3-T2))
  - `A25 atomicity: set default writes both updates and audit in one batch`
  - Delete the category's default is rejected with 400

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement service**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

  `feat(status): add taskStatus service with A25/A26 atomicity`

### Task 5: Action, Loader, and Route

**Files:**
- Create: `apps/web/app/actions/adminStatusesAction.ts`
- Create: `apps/web/app/loaders/adminStatusesLoader.ts`
- Create: `apps/web/app/routes/_app.admin.statuses.tsx`

**Interfaces:**
- Consumes: `taskStatusService`, `requireUser`, `requireSystemRole`, `canManageStatuses`

- [ ] **Step 1: Write action contract tests**

  Test file: `apps/web/test/status/adminStatusesAction.test.ts`
  - `create` intent with valid data → 201
  - `create` intent with invalid data → 400 with field errors
  - `update` intent → 200
  - `reorder` intent → 200
  - `setDefault` intent → 200
  - `delete` intent → 200
  - Unknown intent → 400
  - Non-Admin → 403

- [ ] **Step 2: Write loader tests**

  Test file: `apps/web/test/status/adminStatusesLoader.test.ts`
  - Returns statuses with taskCount
  - Non-Admin gets 403

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement action, loader, and route**

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Run all checks**

  ```
  pnpm lint
  pnpm format:check
  pnpm typecheck
  pnpm exec vitest run --maxWorkers=2
  pnpm build
  pnpm test:e2e
  ```

- [ ] **Step 7: Commit and push**

  `feat(status): add /admin/statuses route with CRUD actions`
