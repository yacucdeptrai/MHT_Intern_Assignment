# Implementation Plan: M2-T3 Project Settings (Update, Archive, Admin Filter)

- **Task**: M2-T3 `feature/project-settings`
- **Branch**: `feature/project-settings`
- **Target Branch**: `develop`
- **Author**: yacucdeptrai
- **References**:
  - `docs/01-srs.md` (FR-08 Update Project, FR-09 Archive Project)
  - `docs/02-architecture.md` (Clean Architecture, layering, Zod validation at action boundary)
  - `docs/03-database-design.md` (Soft deletion `deleted_at`, constraints)
  - `docs/04-data-access-and-atomicity.md` (Batch A2 for update, Batch A3 for archive, `conflictGuardStmt`)
  - `docs/05-rbac-and-workflow.md` (RBAC matrix, project access, archived read-only invariant)
  - `docs/06-routes-and-actions.md` (`_app.projects.$projectId.settings.tsx`, `/projects` archived filter)
  - `docs/10-implementation-roadmap.md` (§M2-T3)

---

## 1. Objectives

1. Implement `ProjectUpdateSchema` and `ProjectSettingsDto` in `@pm/domain`.
2. Add `updateStmt`, `archiveStmt`, and `listArchived` in `projectRepository` (`@pm/db`).
3. Implement `updateProject` (Batch A2: update project, conflict guard, insert audit log `PROJECT_UPDATED`) in `projectService`:
   - Validates changes against `ProjectUpdateSchema` and date constraints.
   - Ignores posted `code` (read-only, immutable).
   - Generates diff for `audit_logs.changes`.
   - Enforces 403 for `TEAM_LEAD` and `MEMBER`.
   - Enforces 403 "This project is archived" if project is already archived.
4. Implement `archiveProject` (Batch A3: set `deleted_at = now`, conflict guard, insert audit log `PROJECT_ARCHIVED`) in `projectService`:
   - Soft-deletes project.
   - Enforces 403 for `TEAM_LEAD` and `MEMBER`.
   - Enforces 403 "This project is archived" if already archived.
5. Implement `getProjectSettings` in `projectService`.
6. Add Admin "Archived" filter to `projectService.listProjects`, `projectsLoader`, and `/projects` list view.
7. Implement `_app.projects.$projectId.settings.tsx` with settings form (Name, Description, Budget, Timeline, Status, Slack Channel, read-only Code), and Danger Zone Archive confirmation button.
8. Follow TDD: Unit tests for schemas, repositories, service methods, action handlers, loaders, and Playwright E2E journey.

---

## 2. Technical Design & Layering

### 2.1 Domain (`packages/domain`)
- `ProjectUpdateSchema`:
  - `code`: omitted.
  - `name`: string 1..150 chars, optional.
  - `description`: string ≤ 10,000 chars, nullish.
  - `budget`: positive integer, nullish.
  - `startDate`: YYYY-MM-DD, optional.
  - `endDate`: YYYY-MM-DD, optional.
  - `status`: `PROJECT_STATUSES` enum, optional.
  - `slackChannelId`: string ≤ 50 chars, nullish.
  - `withDateOrder` refinement for start/end dates.
- `ProjectSettingsDto`:
  - `id, code, name, description, budget, startDate, endDate, status, slackChannelId, isArchived`.

### 2.2 Repository Layer (`packages/db`)
- `projectRepository.updateStmt(db, id, patch)`: updates fields where `id = ?` and `deleted_at IS NULL`.
- `projectRepository.archiveStmt(db, id, deletedAt)`: sets `deleted_at = ?, updated_at = ?` where `id = ?` and `deleted_at IS NULL`.
- `projectRepository.listArchived(db)`: selects where `deleted_at IS NOT NULL` ordered by `deleted_at DESC`.

### 2.3 Service Layer (`apps/web/app/services/project/project.service.ts`)
- `updateProject(ctx, projectId, input)`:
  - Calls `loadProjectAccess(ctx, projectId)`.
  - Checks if `access.isArchived` -> 403 "This project is archived".
  - Checks `canManageProject(actor, "update")` -> 403.
  - Validates with `ProjectUpdateSchema`.
  - Audits diff in `PROJECT_UPDATED`.
  - Executes Batch A2 with `conflictGuardStmt`.
- `archiveProject(ctx, projectId)`:
  - Calls `loadProjectAccess(ctx, projectId)`.
  - Checks if `access.isArchived` -> 403 "This project is archived".
  - Checks `canManageProject(actor, "archive")` -> 403.
  - Executes Batch A3 with `conflictGuardStmt`.
- `getProjectSettings(ctx, projectId)`:
  - Calls `loadProjectAccess(ctx, projectId)`.
  - Returns `{ project: ProjectSettingsDto }`.
- `listProjects(ctx, options)`:
  - Supports `archivedOnly: true` and `includeArchived: true` for Admins.

### 2.4 Action & Loader Layer (`apps/web/app/actions`, `loaders`, `routes`)
- `projectSettingsLoader.ts`: calls `projectService.getProjectSettings`.
- `projectSettingsAction.ts`: handles `intent="update"` and `intent="archive"`.
- `_app.projects.$projectId.settings.tsx`: settings page with update form and Danger Zone archive modal/button.
- `_app.projects._index.tsx`: filter pills for Admin ("Active", "Archived").

---

## 3. Test Cases (TDD)

- **Schema tests** (`packages/domain/test/project.schema.test.ts`):
  - Validates `ProjectUpdateSchema` accepts partial updates.
  - Rejects `endDate < startDate`.
  - Omits / ignores `code`.
  - Validates `status` values.
- **Repository integration tests** (`packages/db/test/projectRepositories.test.ts`):
  - `updateStmt` updates project fields where not deleted.
  - `archiveStmt` sets `deleted_at`.
  - `conflictGuardStmt` rolls back when updating or archiving non-existent / already deleted project.
  - `listArchived` returns only archived projects.
- **Service integration tests** (`apps/web/test/project/project.service.test.ts`):
  - FR-08 c1: PM or Admin updates project, diff saved in `PROJECT_UPDATED`.
  - FR-08 c2: Posted `code` is ignored, remains unchanged.
  - FR-08 c3: Team Lead or Member receives 403.
  - FR-09 c1: PM or Admin archives project, `deleted_at` set, `PROJECT_ARCHIVED` audited.
  - FR-09 c2: Archived project disappears from standard member lists.
  - FR-09 c3: Team Lead or Member receiving 403 on archive.
  - FR-09 c4: Updating an archived project receives 403 "This project is archived".
  - Admin filter: `listProjects` with `archivedOnly` returns archived projects for Admin, never for member.
- **Action & Loader tests** (`apps/web/test/project/projectSettingsRoute.test.ts`):
  - Loader returns settings DTO for PM and Admin, 403 for member.
  - Update action returns 200/redirect on success, 400 on validation error, 403 for member.
  - Archive action archives project and redirects to `/projects`.
- **E2E test** (`apps/web/e2e/projectSettings.spec.ts`):
  - PM updates project settings (name, description, status).
  - Verifies update persisted and displayed in project header.
  - PM archives project.
  - Verifies project disappears from active list.
  - Admin views project in Archived list.
