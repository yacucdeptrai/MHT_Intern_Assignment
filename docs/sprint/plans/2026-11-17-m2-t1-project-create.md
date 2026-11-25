# Implementation Plan: Project Creation and Projects List (M2-T1)

**Task**: M2-T1 `feature/project-create`  
**Authoritative Requirement**: FR-07 (`docs/01-srs.md`), docs/03, docs/04 §4 A1, docs/05 §2 & §5, docs/06 §3.4  
**Branch**: `feature/project-create` (branched from `develop`)  

---

## 1. Requirements & Acceptance Criteria

- **FR-07 Criterion 1**: Given a system PM or Admin, When they submit a code (2–10 characters, letters, digits, or hyphens, stored uppercase), a name (1–150 chars), an optional description (up to 10,000 chars), an optional budget (an integer in minor units of `APP_CURRENCY`, at least 0), and start/end dates (`YYYY-MM-DD`), Then, in one atomic operation (A1), the project is created with status `ACTIVE`, the creator becomes its project PM, and `PROJECT_CREATED` is audited.
- **FR-07 Criterion 2**: Given a code that already exists, including on archived projects, When they submit, Then a 400 field error `"Project code is already in use"` is shown and the input is kept.
- **FR-07 Criterion 3**: Given an end date before the start date, When they submit, Then a 400 field error is shown (`"End date must be on or after start date"`).
- **FR-07 Criterion 4**: Given a system `MEMBER` or `TEAM_LEAD`, When they post to create a project, Then they receive 403.
- **Projects List**: `/projects` shows projects list:
  - Admin sees all projects (with "Archived" toggle / filter in future M2-T3).
  - Non-Admin (PM, TEAM_LEAD, MEMBER) sees only projects they are members of.
  - "New Project" button visible when `canCreate` is true (System Admin or PM).

---

## 2. Technical Architecture & Layering

### 2.1 Database & Migrations
- Create `packages/db/src/schema/projectMembers.ts`:
  - Columns:
    - `project_id` (text, not null, FK -> `projects.id`)
    - `user_id` (text, not null, FK -> `users.id`)
    - `project_role` (text, enum `ProjectRole`: `PM`, `TEAM_LEAD`, `MEMBER`, not null)
    - `created_at` (integer timestamp_ms, not null)
  - Primary Key: composite `[table.projectId, table.userId]`
  - Index: `idx_project_members_user` on `user_id`
  - Check constraint: `project_members_role_check` on `project_role IN ('PM', 'TEAM_LEAD', 'MEMBER')`
- Add migration `packages/db/migrations/0005_project_members.sql`.
- Export in `packages/db/src/schema/index.ts`.

### 2.2 Repositories
- `packages/db/src/repositories/project.repository.ts`:
  - `insertStmt(db, values)`: statement builder for insert
  - `findById(db, id)`: finds active project by id
  - `findByIdIncludingArchived(db, id)`: finds project by id regardless of `deletedAt`
  - `findByCode(db, code)`: finds project by uppercase code (including archived, to check uniqueness)
  - `listAll(db, options)`: lists all non-archived projects (for Admin)
  - `listForUser(db, userId, options)`: joins `project_members` to list projects where `user_id = userId`
- `packages/db/src/repositories/projectMember.repository.ts`:
  - `insertStmt(db, values)`: statement builder for insert
  - `findByProjectAndUser(db, projectId, userId)`
  - `listByProject(db, projectId)`
  - `listByUser(db, userId)`
- Export repositories in `packages/db/src/index.ts`.

### 2.3 Domain Layer
- `packages/domain/src/schemas/dateOrder.ts`:
  - Shared `withDateOrder<T extends z.ZodTypeAny>(schema, startKey, endKey)` helper using `superRefine`.
- `packages/domain/src/schemas/project.ts`:
  - `ProjectBaseSchema`:
    - `code`: trimmed, uppercase, `/^[A-Za-z0-9-]{2,10}$/`, stored uppercase
    - `name`: trimmed, 1–150 chars
    - `description`: optional/nullable string, <= 10,000 chars
    - `budget`: optional/nullable integer >= 0
    - `startDate`: `/^\d{4}-\d{2}-\d{2}$/`
    - `endDate`: `/^\d{4}-\d{2}-\d{2}$/`
    - `slackChannelId`: optional/nullable string
  - `ProjectCreateSchema = withDateOrder(ProjectBaseSchema, 'startDate', 'endDate')`
- `packages/domain/src/policies/project.ts`:
  - `canManageProject(actor: ActorContext, action: 'create' | 'update' | 'archive'): boolean`
    - `'create'`: `actor.systemRole === 'ADMIN' || actor.systemRole === 'PM'`
- Export in `packages/domain/src/index.ts`.

### 2.4 Service Layer
- `apps/web/app/services/project/project.service.ts`:
  - `createProject(ctx, input)`:
    - Authorize: `canManageProject(toActor(ctx.user, null), 'create')` -> throw `ForbiddenError` (403)
    - Check unique code (case-insensitive): `projectRepository.findByCode(ctx.db, input.code)`. If exists, throw `ValidationError({ code: "Project code is already in use" })`.
    - Generate `projectId = crypto.randomUUID()`.
    - Atomic batch A1:
      1. `projectRepository.insertStmt(ctx.db, ...)`
      2. `projectMemberRepository.insertStmt(ctx.db, { projectId, userId: ctx.user.id, projectRole: 'PM', createdAt: now })`
      3. `auditLogRepository.insertStmt(ctx.db, { id: crypto.randomUUID(), actorId: ctx.user.id, action: 'PROJECT_CREATED', entityType: 'PROJECT', entityId: projectId, projectId, changes: JSON.stringify(input), createdAt: now })`
    - Returns created project.
  - `listProjects(ctx)`:
    - If `ctx.user.systemRole === 'ADMIN'`, returns `projectRepository.listAll(ctx.db)`.
    - Otherwise returns `projectRepository.listForUser(ctx.db, ctx.user.id)`.

### 2.5 Route Layer
- `apps/web/app/routes/_app.projects._index.tsx`:
  - Loader: requires user, calls `projectService.listProjects(ctx)`, checks `canCreate = canManageProject(toActor(user, null), 'create')`. Returns `{ projects, canCreate }`.
  - UI: Project list table / cards, link to `/projects/new` if `canCreate`.
- `apps/web/app/routes/_app.projects.new.tsx`:
  - Loader: requires user, checks `canManageProject`, throws 403 if unauthorized.
  - Action: requires user, parses formData with `ProjectCreateSchema`, calls `projectService.createProject(ctx, data)`. On success, redirects to `/projects`. On validation error, returns 400 with field errors and values kept.
- `apps/web/app/routes/_app.projects.$projectId.tsx` (stub/placeholder for layout):
  - Minimal layout or simple redirect for now, or direct redirect to `/projects` after creation.

---

## 3. TDD & Testing Plan

1. **Domain Unit Tests**:
   - `packages/domain/test/dateOrder.test.ts`: test `withDateOrder` with valid dates, end < start, missing dates.
   - `packages/domain/test/projectSchemas.test.ts`: test `ProjectCreateSchema` code validation, uppercase conversion, length, budget >= 0.
   - `packages/domain/test/projectPolicy.test.ts`: test `canManageProject` for ADMIN, PM, TEAM_LEAD, MEMBER.
2. **Repository Integration Tests**:
   - `packages/db/test/projectRepository.test.ts`: insert, findByCode (including archived), listAll, listForUser.
   - `packages/db/test/projectMemberRepository.test.ts`: insert, findByProjectAndUser, listByProject, listByUser.
3. **Service Unit & Integration Tests**:
   - `apps/web/test/project/project.service.test.ts`:
     - `FR-07 c1`: Admin and PM create project atomically with PM membership and PROJECT_CREATED audit log.
     - `FR-07 c2`: Duplicate code throws 400 "Project code is already in use".
     - `FR-07 c3`: End date before start date throws 400.
     - `FR-07 c4`: System MEMBER and TEAM_LEAD get 403.
4. **Route / Action Tests**:
   - `apps/web/test/project/projectRoutes.test.ts`: tests for `/projects/new` action and `/projects` loader.
5. **E2E Tests**:
   - `apps/web/e2e/projectCreate.spec.ts`: PM logs in, creates a project, sees it in `/projects`. System MEMBER logs in, sees only their member projects, cannot access `/projects/new` (receives 403).
