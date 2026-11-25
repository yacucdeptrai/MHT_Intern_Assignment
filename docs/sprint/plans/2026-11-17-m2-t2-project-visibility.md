# Implementation Plan: M2-T2 Project Visibility and Access Control

- **Task**: M2-T2 `fix/project-visibility`
- **Branch**: `fix/project-visibility`
- **Target Branch**: `develop`
- **Author**: yacucdeptrai
- **References**:
  - `docs/01-srs.md` (FR-08, FR-16, FR-24)
  - `docs/02-architecture.md` (Layering, error handling, RequestContext)
  - `docs/05-rbac-and-workflow.md` (§2 Project Access, §3.2 Permission Matrix, §5 Policy Functions, §5.2 Guards, §5.3 Permissions for the UI)
  - `docs/06-routes-and-actions.md` (§3.4 Projects layout and child routes)
  - `docs/09-testing-strategy.md` (§3.1 Permission Matrix table-driven suite & 404 sweep, E2E Journey 6)
  - `docs/10-implementation-roadmap.md` (§M2-T2)

---

## 1. Objectives

1. Implement all 15 pure project policy functions in `@pm/domain` according to the RBAC matrix (`docs/05` §3.2 & §5.1), with explicit support for `ActorContext`, `TaskPolicyTarget`, and the rule that archived projects are strictly read-only for Admins and completely hidden (404) for non-admins.
2. Implement `ProjectPermissions` and `getProjectPermissions(actor: ActorContext)` in `@pm/domain` and export them.
3. Implement `ProjectHeaderDto` in `@pm/domain`.
4. Implement `loadProjectAccess(ctx: RequestContext, projectId: string): Promise<ProjectAccess>` in `apps/web/app/utils/auth.server.ts` enforcing:
   - 404 for non-members (never 403, preventing resource enumeration).
   - 404 for non-existent or soft-deleted projects.
   - 404 for archived projects when requested by non-admin members.
   - Full PM access for Admins across any project (active or archived read-only).
   - Project role access for active members of active projects.
5. Implement `getProjectHeader` in `projectService` and loader `projectHeaderLoader`.
6. Implement project route layout `_app.projects.$projectId.tsx` and child index route `_app.projects.$projectId._index.tsx`.
7. Write table-driven unit tests for all rows and actors of the permission matrix, 404 sweep integration tests for project routes, and Playwright E2E tests for non-member 404 isolation.

---

## 2. Technical Details & Layering

### 2.1 Domain Layer (`packages/domain`)
- **Policies (`packages/domain/src/policies/project.ts`)**:
  - `canViewProject(actor: ActorContext): boolean`
  - `canManageProject(actor: ActorContext, action: 'create' | 'update' | 'archive'): boolean`
  - `canManageMembers(actor: ActorContext): boolean`
  - `canCreateTask(actor: ActorContext): boolean`
  - `canEditTask(actor: ActorContext, task: TaskPolicyTarget): boolean`
  - `canArchiveTask(actor: ActorContext, task: TaskPolicyTarget): boolean`
  - `canAssignTask(actor: ActorContext): boolean`
  - `canApproveTask(actor: ActorContext): boolean`
  - `canReopenTask(actor: ActorContext): boolean`
  - `canDeleteComment(actor: ActorContext, comment: { authorId: string }): boolean`
  - `canDeleteAttachment(actor: ActorContext, attachment: { uploadedById: string }): boolean`
  - `canManageSprint(actor: ActorContext): boolean`
  - `canViewMemberReport(actor: ActorContext): boolean`
  - `canViewProjectReport(actor: ActorContext): boolean`
  - `canExportProject(actor: ActorContext): boolean`
- **Permissions helper**:
  - `ProjectPermissions` interface
  - `getProjectPermissions(actor: ActorContext): ProjectPermissions`
- **DTOs (`packages/domain/src/types/project.ts`)**:
  - `ProjectHeaderDto`

### 2.2 Auth & Guards (`apps/web/app/utils/auth.server.ts`)
- `loadProjectAccess(ctx: RequestContext, projectId: string): Promise<ProjectAccess>`:
  - Injected `db: ctx.db` passed to repository calls.
  - Returns `{ project, projectRole, isAdmin, isArchived }`.
  - Throws `NotFoundError` on non-member, soft-deleted, missing, or archived for non-admin.

### 2.3 Service Layer (`apps/web/app/services/project/project.service.ts`)
- `getProjectHeader(ctx: RequestContext, projectId: string)`:
  - Calls `loadProjectAccess`.
  - Transforms to `ActorContext` via `toActor(ctx.user, access)`.
  - Verifies `canViewProject(actor)` (throws `NotFoundError` if false).
  - Returns `{ project: ProjectHeaderDto, permissions: ProjectPermissions }`.

### 2.4 Route & UI Layer (`apps/web/app/routes/`)
- `_app.projects.$projectId.tsx`:
  - Calls `projectHeaderLoader`.
  - Displays Project Code, Title, Role badge, Status badge.
  - Tab navigation: Tasks (`/projects/:projectId`), Sprints, Members, Settings (if `canManageProject`), Reports (if `canViewMemberReport` or `canViewProjectReport`).
  - `<Outlet />` for child views.
- `_app.projects.$projectId._index.tsx`:
  - Child index view showing project details and task overview placeholder.

---

## 3. TDD & Verification Steps

1. **Policy Tests**: Table-driven tests in `packages/domain/test/project.policy.test.ts` testing every cell of the project-level permission matrix for 7 actor roles and archived invariants.
2. **Access Integration Tests**: `apps/web/test/project/projectAccess.test.ts` testing `loadProjectAccess` against D1 SQLite for Admin, PM, Team Lead, Member, Non-Member, archived, deleted, and missing project.
3. **Route & 404 Sweep Tests**: `apps/web/test/project/projectVisibilitySweep.test.ts` testing that all project routes throw/return 404 for non-members and missing projects.
4. **E2E Access Journey**: `apps/web/e2e/projectAccess.spec.ts` testing browser navigation for non-members receiving 404.
5. **Quality Gates**:
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm typecheck`
   - `pnpm spell`
   - `pnpm deps:check`
   - `pnpm exec vitest run --maxWorkers=2`
   - `pnpm build`
   - `pnpm test:e2e` (with isolated `.wrangler/state` backup)
