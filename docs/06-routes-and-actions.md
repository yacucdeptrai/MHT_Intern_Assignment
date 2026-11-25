# Routes and Actions

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [SRS](./01-srs.md) · [RBAC & workflow](./05-rbac-and-workflow.md) · [Architecture](./02-architecture.md) · [Data access](./04-data-access-and-atomicity.md)

---

## 1. Conventions

- **Flat file routes.** `app/routes.ts` exports `flatRoutes()` from `@react-router/fs-routes`, so files in `apps/web/app/routes/` map to URLs exactly as in the tree below, with names in kebab-case segments (`projects.$projectId.tasks.$taskId.tsx`). Route modules are thin. They re-export `loader` and `action` from `app/loaders/*Loader.ts` and `app/actions/*Action.ts`.
- **One action per route, dispatched by `intent`.** Forms post a hidden `intent` field. The action runs `IntentSchema.safeParse` on it, then the schema for that intent, and calls exactly one service function. An unknown `intent` returns 400.
- **Responses.**
  - Success: `{ success: true, data?: T }` with status 200, or 201 for creates. Redirects use `redirect()` after creates that navigate.
  - Failure: `{ success: false, errors: Record<string, string[]>, message?: string }` with the status from the error model ([Architecture §4.4](./02-architecture.md#44-error-model)).
- **Every loader and action** reads the `RequestContext` with `context.get(requestContextKey)` (set once per request by the Worker entry; [Architecture §4.3](./02-architecture.md#43-requestcontext)) and calls `requireUser`, except the public routes. Project-scoped ones go through services that call `loadProjectAccess`, which returns 404 for non-members.
- **Concurrency.** Every task mutation form includes the `version` it loaded. A stale version returns 409.
- **Permissions in loader data.** Project and task loaders return `permissions: ProjectPermissions` (plus task flags), computed by the policies ([RBAC §5.3](./05-rbac-and-workflow.md#53-permissions-for-the-ui)).

## 2. Layout Structure

React Router gives each route a single parent, so layout selection happens in one pathless layout route, `_app.tsx`:
- It calls `requireUser`.
- It renders `AdminShell` for system `ADMIN`/`PM`, or `MemberShell` otherwise. These are the two layouts of decision P4.
- Its children render inside whichever shell applies. Project pages are therefore shared, as P4 requires.

```text
routes/
├── login.tsx                          public
├── logout.tsx                         public (POST)
├── auth.$provider.tsx                 public: start OAuth
├── auth.$provider.callback.tsx        public: OAuth callback
├── invite.$token.tsx                  public: accept invite
├── _app.tsx                           layout: requireUser → AdminShell | MemberShell
├── _app._index.tsx                    /                member dashboard (admins are redirected to /admin)
├── _app.my-tasks.tsx                  /my-tasks
├── _app.calendar.tsx                  /calendar
├── _app.notifications.tsx             /notifications
├── _app.profile.tsx                   /profile
├── _app.admin.tsx                     /admin           layout guard: requireSystemRole(['ADMIN','PM'])
├── _app.admin._index.tsx              /admin           admin dashboard
├── _app.admin.users.tsx               /admin/users     Admin only
├── _app.admin.statuses.tsx            /admin/statuses  Admin only
├── _app.admin.audit-log.tsx           /admin/audit-log Admin only
├── _app.projects._index.tsx           /projects
├── _app.projects.new.tsx              /projects/new
├── _app.projects.$projectId.tsx       layout: project header + tabs (loadProjectAccess)
├── _app.projects.$projectId._index.tsx              /projects/:projectId  (task list)
├── _app.projects.$projectId.tasks.$taskId.tsx       /projects/:projectId/tasks/:taskId
├── _app.projects.$projectId.sprints.tsx             /projects/:projectId/sprints
├── _app.projects.$projectId.members.tsx             /projects/:projectId/members
├── _app.projects.$projectId.settings.tsx            /projects/:projectId/settings
├── _app.projects.$projectId.reports.tsx             /projects/:projectId/reports
├── api.realtime.ts                    WebSocket upgrade
├── api.attachments.upload.ts          POST multipart
├── api.attachments.$attachmentId.ts   GET download
├── api.avatars.$userId.ts             GET avatar
├── api.projects.$projectId.export.ts  GET csv | rows
└── api.health.ts                      GET, used by the deploy smoke check
```

## 3. Route Catalog

Loader data types are named `<Route>LoaderData` and declared next to the loader. Schemas live in `packages/domain/src/schemas/` and are imported by name.

### 3.1 Public

| Path | File | FR | Loader data | Actions (`intent` → schema → service) |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `login.tsx` | FR-01, FR-02 | `{ ssoProviders: OAuthProvider[]; redirectTo: string \| null }`; a signed-in user is redirected home | `login` → `LoginSchema { email, password, redirectTo? }` → `authService.loginWithPassword`; sets the cookie and redirects to a safe `redirectTo` |
| `/logout` | `logout.tsx` | FR-01 | n/a | `POST`: destroys the session and redirects to `/login` |
| `/auth/:provider` | `auth.$provider.tsx` | FR-02 | n/a | `POST`: redirect to the provider (state and PKCE stored in a short-lived cookie); 404 if not configured |
| `/auth/:provider/callback` | `auth.$provider.callback.tsx` | FR-02 | Runs `authService.loginWithOAuth`, then redirects home or to `/login?error=no_account` | n/a |
| `/invite/:token` | `invite.$token.tsx` | FR-37 | `{ status: 'valid' \| 'invalid'; email?: string; projectName?: string }` | `accept` → `AcceptInviteSchema { password, confirmPassword }` → `inviteService.acceptInvite` (A8); signs in |

### 3.2 Member and shared pages

| Path | File | FR | Permission | Loader data | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `_app._index.tsx` | FR-33, FR-34 | signed in (admins redirected to `/admin`) | `DashboardLoaderData { inProgress: TaskListItem[]; todayPriorities: TaskListItem[]; overdue: OverdueItem[]; unreadCount: number }` | none |
| `/my-tasks` | `_app.my-tasks.tsx` | FR-16 | signed in | `{ tasks: Page<TaskListItem>; filters: MyTaskFilters; projects: ProjectOption[] }`. Filters come from URL search params, parsed with `MyTaskFiltersSchema` | none |
| `/calendar` | `_app.calendar.tsx` | FR-35 | signed in; the project filter is limited to accessible projects | `{ view: 'day' \| 'week' \| 'month'; range: { from: string; to: string }; events: CalendarEvent[] }` | none |
| `/notifications` | `_app.notifications.tsx` | FR-25, FR-26 | signed in (own only) | `{ notifications: Page<NotificationDto>; unreadCount: number }` | `markRead` → `MarkReadSchema { notificationId }`; `markAllRead` → none → `notificationService` (A28) |
| `/profile` | `_app.profile.tsx` | FR-05, FR-06 | signed in (own only) | `{ profile: ProfileDto; memberships: MembershipDto[]; hasPassword: boolean }` | `updateProfile` → `ProfileUpdateSchema { fullName, phone? }`; `changePassword` → `ChangePasswordSchema { currentPassword?, newPassword, confirmPassword }`; avatar upload goes through `api.avatars.$userId` (`POST`) |

### 3.3 Admin pages

| Path | File | FR | Permission | Loader data | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/admin` | `_app.admin._index.tsx` | FR-33 | `ADMIN`, `PM` | `DashboardLoaderData` plus `{ projectsAtRisk: ProjectRiskItem[] }` (`ProjectRiskItem = { id: string; code: string; name: string; overdueCount: number }`; active non-archived projects with ≥1 overdue task per P19, ADMIN sees all, PM sees member projects, sorted by `overdueCount` DESC, then `code` ASC) | none |
| `/admin/users` | `_app.admin.users.tsx` | FR-03, FR-04 | `canManageUsers` | `{ users: Page<UserAdminRow>; filters: UserFilters }` | `create` → `UserCreateSchema { fullName, email, systemRole, department? }` → `userService.createUser` (A9), which returns `inviteUrl`; `update` → `UserUpdateSchema` (= `UserCreateSchema.partial().extend({ userId })`); `lock` / `unlock` / `delete` → `UserIdSchema { userId }`; `setRole` → `SetSystemRoleSchema { userId, systemRole }` → A10 |
| `/admin/statuses` | `_app.admin.statuses.tsx` | FR-20 | `canManageStatuses` | `{ statuses: StatusAdminRow[] }`, each with `taskCount` | `create` → `StatusCreateSchema { name, category }`; `update` → `StatusUpdateSchema` (= `StatusCreateSchema.partial().extend({ statusId })`); `reorder` → `StatusReorderSchema { orderedIds: string[] }`; `setDefault` → `StatusIdSchema` (A25); `delete` → `StatusIdSchema` (A26) |
| `/admin/audit-log` | `_app.admin.audit-log.tsx` | FR-24 | `canViewAuditLog` | `{ entries: Page<AuditLogRow>; filters: AuditFilters }`. Filters: actor, entity type, action, date range | none |

### 3.4 Projects (shared by both layouts)

| Path | File | FR | Permission | Loader data | Actions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/projects` | `_app.projects._index.tsx` | FR-16 | signed in. Admin sees all, with an "Archived" filter; others see their memberships | `{ projects: Page<ProjectListItem>; canCreate: boolean }` | none |
| `/projects/new` | `_app.projects.new.tsx` | FR-07 | `canManageProject(actor, 'create')`, else 403 | `{}` | `create` → `ProjectCreateSchema { code, name, description?, budget?, startDate, endDate, slackChannelId? }` → `projectService.createProject` (A1); redirect to the project |
| `/projects/:projectId` (layout) | `_app.projects.$projectId.tsx` | FR-08 | `canViewProject` (404 otherwise) | `{ project: ProjectHeaderDto; permissions: ProjectPermissions }` | none |
| `/projects/:projectId` | `_app.projects.$projectId._index.tsx` | FR-12, FR-16, FR-17 | `canViewProject` | `{ tasks: Page<TaskListItem>; filters: ProjectTaskFilters; statuses: StatusOption[]; members: MemberOption[]; sprints: SprintOption[] }` | `createTask` → `TaskCreateSchema { title, description?, priority, startDate?, dueDate?, sprintId?, parentTaskId?, assigneeIds? }` → `taskService.createTask` (A14). `assigneeIds` is accepted only from leads; for others it causes a 403 |
| `/projects/:projectId/tasks/:taskId` | `_app.projects.$projectId.tasks.$taskId.tsx` | FR-13–FR-15, FR-17–FR-19, FR-21–FR-24 | `canViewProject`; per intent below | `{ task: TaskDetailDto; subTasks: TaskListItem[]; comments: CommentThread[]; attachments: AttachmentDto[]; history: AuditLogRow[]; statuses: StatusOption[]; members: MemberOption[]; sprints: SprintOption[]; taskPermissions: TaskPermissions }` | See §3.5 |
| `/projects/:projectId/sprints` | `_app.projects.$projectId.sprints.tsx` | FR-36 | view: `canViewProject`; mutate: `canManageSprint` | `{ sprints: SprintRow[] }`, each with its completion rate (or `null` = "No tasks") | `create` → `SprintCreateSchema { name, startDate, endDate }` (A11); `update` → `SprintUpdateSchema` (= `SprintCreateSchema.partial().extend({ sprintId })`) (A12); `archive` → `SprintIdSchema` (A13) |
| `/projects/:projectId/members` | `_app.projects.$projectId.members.tsx` | FR-10, FR-11, FR-37 | view: `canViewProject`; mutate: `canManageMembers` | `{ members: MemberRow[]; pendingInvites: InviteRow[] }` | `searchUsers` (GET via `useFetcher`, `?q=`) → `UserSearchSchema { q }`; `add` → `MemberAddSchema { userId, projectRole }` (A4); `invite` → `MemberInviteSchema { email, projectRole }` (A7), which returns `inviteUrl`; `changeRole` → `MemberRoleSchema { userId, projectRole }` (A6); `remove` → `MemberIdSchema { userId }` (A5) |
| `/projects/:projectId/settings` | `_app.projects.$projectId.settings.tsx` | FR-08, FR-09 | `canManageProject(actor, 'update')` | `{ project: ProjectSettingsDto }` | `update` → `ProjectUpdateSchema` (= `ProjectCreateSchema.omit({ code: true }).partial().extend({ status })`) (A2); `archive` → none (A3) |
| `/projects/:projectId/reports` | `_app.projects.$projectId.reports.tsx` | FR-30, FR-31 | `canViewMemberReport` for the member tab; `canViewProjectReport` for the project tab | `{ memberReport?: MemberReportRow[]; projectReport?: ProjectReportDto }`. A section the user may not see is omitted; requesting it via `?tab=` returns 403 | none |

### 3.5 Task detail intents

All of these are posted to `/projects/:projectId/tasks/:taskId`. Every intent that changes the task carries `version`.

| `intent` | Schema | Service (catalog) | Policy | FR |
| :--- | :--- | :--- | :--- | :--- |
| `update` | `TaskUpdateSchema` = `TaskCreateSchema.omit({ parentTaskId: true, assigneeIds: true }).partial().extend({ version })` | `taskService.updateTask` (A15) | `canEditTask` | FR-13, FR-36 |
| `changeStatus` | `TaskStatusChangeSchema { statusId, version }` | `taskService.changeStatus` (A16) | `canEditTask` + `assertTransitionAllowed(…, 'UPDATE')` | FR-21 |
| `assign` | `TaskAssignSchema { assigneeIds: string[], version }` | `taskService.assignTask` (A17) | `canAssignTask` | FR-15 |
| `approve` | `TaskApproveSchema { version }` | `taskService.approveTask` (A18) | `canApproveTask` | FR-22 |
| `reject` | `TaskReasonSchema { reason, version }`, with `reason` trimmed to 1–2,000 characters | `taskService.rejectTask` (A19) | `canApproveTask` | FR-23 |
| `reopen` | `TaskReasonSchema` | `taskService.reopenTask` (A19) | `canReopenTask` | FR-23 |
| `archive` | `TaskVersionSchema { version }` | `taskService.archiveTask` (A20) | `canArchiveTask` | FR-14 |
| `addSubTask` | `TaskCreateSchema` with `parentTaskId` forced to this task | `taskService.createTask` (A14) | `canCreateTask` | FR-17 |
| `comment` | `CommentCreateSchema { body, parentCommentId? }` | `commentService.addComment` (A21) | `canViewProject` | FR-19 |
| `deleteComment` | `CommentIdSchema { commentId }` | `commentService.deleteComment` (A22) | `canDeleteComment` | FR-19 |
| `deleteAttachment` | `AttachmentIdSchema { attachmentId }` | `attachmentService.deleteAttachment` (A24) | `canDeleteAttachment` | FR-18 |

### 3.6 Resource routes

| Path | Method | FR | Permission | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `/api/realtime` | GET (WebSocket upgrade) | FR-26 | signed in, else 401 | Forwards to `UserNotificationHub` via `idFromName(userId)` ([Background jobs §4](./07-background-jobs-and-integrations.md#4-realtime-notifications)) |
| `/api/attachments/upload` | POST multipart `{ projectId, taskId, file }` | FR-18 | `canViewProject` | Checks size (≤ `MAX_ATTACHMENT_BYTES`) and content type, puts the object in R2, then runs batch A23. Returns `AttachmentDto` (201) |
| `/api/attachments/:attachmentId` | GET | FR-18 | `canViewProject` on the attachment's project | Streams from R2 with `Content-Disposition: attachment`; 404 for non-members |
| `/api/avatars/:userId` | GET / POST | FR-06 | GET: signed in; POST: own user only | GET streams the avatar or a default image. POST validates the image (≤ 10 MB), puts it at `avatars/{userId}`, then runs batch A29 (sets `users.avatar_key`, audited) |
| `/api/projects/:projectId/export` | GET `?format=csv\|rows` | FR-32 | `canExportProject` | Returns CSV (UTF-8 with BOM) or JSON rows for browser-side `.xlsx` generation via SheetJS; prefixes formula-leading cells with `'` |
| `/api/health` | GET | n/a | public | `{ ok: true, version }` after a trivial D1 query; used by `deploy.yml` |

**Not route-driven:** FR-27, FR-28, and FR-29 are produced by outbox jobs and the cron ([Background jobs](./07-background-jobs-and-integrations.md)). FR-26 is the realtime route above.

## 4. Validation Parity

Every Create and Update schema is derived from one shared **base object schema**, so the two cannot drift (checklist item 11). Schemas live in `packages/domain/src/schemas/`, with one file per entity.

Cross-field rules (date order) are **not** put on the base. A refined schema is no longer a plain object schema, so `.omit()`, `.partial()`, and `.extend()` stop working on it: in Zod 3 they are missing from `ZodEffects`, and in Zod 4 they throw on refined objects. Instead:
1. Derive Create and Update from the plain `*BaseSchema`.
2. Apply the shared helper `withDateOrder(schema, startKey, endKey)` (a `superRefine` that checks only when both values are present) to each final schema.
3. Pin the Zod major version in `@pm/domain`'s `package.json`.

| Entity | Base | Create | Update |
| :--- | :--- | :--- | :--- |
| User | `UserBaseSchema` | `UserCreateSchema = UserBaseSchema` | `UserUpdateSchema = UserBaseSchema.partial().extend({ userId })` |
| Project | `ProjectBaseSchema` | `ProjectCreateSchema = withDateOrder(ProjectBaseSchema, 'startDate', 'endDate')` | `ProjectUpdateSchema = withDateOrder(ProjectBaseSchema.omit({ code: true }).partial().extend({ status }), 'startDate', 'endDate')` |
| Sprint | `SprintBaseSchema` | `SprintCreateSchema = withDateOrder(SprintBaseSchema, 'startDate', 'endDate')` | `SprintUpdateSchema = withDateOrder(SprintBaseSchema.partial().extend({ sprintId }), 'startDate', 'endDate')` |
| Task | `TaskBaseSchema` | `TaskCreateSchema = withDateOrder(TaskBaseSchema, 'startDate', 'dueDate')` | `TaskUpdateSchema = withDateOrder(TaskBaseSchema.omit({ parentTaskId: true, assigneeIds: true }).partial().extend({ version }), 'startDate', 'dueDate')` |
| Status | `StatusBaseSchema` | `StatusCreateSchema = StatusBaseSchema` | `StatusUpdateSchema = StatusBaseSchema.partial().extend({ statusId })` |

The derivations quoted in §3 (e.g. `TaskCreateSchema.omit(...)`) are shorthand for the base-schema forms in this table. For partial updates the service re-checks the date order against the stored value of the field that was not sent.

Field rules shared by all schemas (`packages/domain/src/schemas/fields.ts`):
- `email`: trimmed, lower-cased, valid email, ≤ 254 characters.
- `code`: trimmed, upper-cased, `/^[A-Z0-9-]{2,10}$/`.
- dates: `/^\d{4}-\d{2}-\d{2}$/` and a real calendar date.
- `password`: 10–128 characters.
- IDs: UUID.
- `priority`: `TaskPriority`.
- `systemRole` / `projectRole`: their enums.

FormData is converted with `Object.fromEntries(formData)`. Array fields (`assigneeIds`) are read with `formData.getAll` before parsing. Error messages are English keys that the client translates (EN/VI).
