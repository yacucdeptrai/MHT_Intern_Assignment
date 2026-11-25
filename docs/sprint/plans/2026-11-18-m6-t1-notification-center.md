# Plan: M6-T1 Notification Center (FR-25 c1..c3, A28)

## 1. Requirements & Scope
- **SRS FR-25 (Notification Center)**:
  - **FR-25 c1**: Given notifications exist, When the user opens the notification center, Then they see their own notifications, newest first, with an unread count.
  - **FR-25 c2**: Given an unread notification, When the user opens it or chooses "Mark all as read", Then it is marked read.
  - **FR-25 c3**: Given a notification about a task the user can no longer access, When they open it, Then they receive 404 from the target page. Do not embed task data in the link beyond IDs.
- **Atomicity & Permissions (A28)**:
  - `notificationService.markRead`: single statement, MUST only ever touch caller's own rows (`user_id = ctx.user.id`). Marking someone else's notification returns 404 and changes nothing.
  - `notificationService.markAllRead`: single statement scoped to caller's `user_id`, updating unread rows.
- **Route & UI**:
  - Route `/notifications` at `apps/web/app/routes/_app.notifications.tsx`
  - Loader: `{ notifications: Page<NotificationDto>, unreadCount: number }`
  - Actions: `intent === "markRead"` with `MarkReadSchema`, `intent === "markAllRead"`
  - UI shows list of notifications (newest first, unread indicator, timestamp, actor, title, reason if rejected), mark as read action, and "Mark all as read" button. Clicking notification link navigates to task or project page.

## 2. Layered Implementation Plan

### Task 1: Domain & DB Layers (`@pm/domain`, `@pm/db`)
1. In `packages/domain/src/types/notification.ts`:
   - Define `NotificationDto` with `id`, `userId`, `type`, `entityId`, `projectId`, `payload`, `readAt`, `createdAt`, and `targetUrl`.
   - Define `NotificationFilters` / pagination query params schema (`NotificationListQuerySchema` with `page`, `pageSize`).
   - Define `MarkReadSchema = z.object({ notificationId: z.string().uuid("Invalid notification ID") })`.
   - Export from `packages/domain/src/index.ts`.
2. Unit tests in `packages/domain/test/notification.schema.test.ts`.
3. In `packages/db/src/repositories/notification.repository.ts`:
   - `countUnread(db: AppDatabase, userId: string): Promise<number>`
   - `listByUserPaginated(db: AppDatabase, userId: string, page: number, pageSize: number): Promise<{ items: Notification[]; total: number }>`
   - `findById(db: AppDatabase, id: string): Promise<Notification | null>`
   - `markReadStmt(db: AppDatabase, id: string, userId: string, readAt: Date)`
   - `markAllReadStmt(db: AppDatabase, userId: string, readAt: Date)`
4. Integration tests in `packages/db/test/notificationRepository.test.ts`.

### Task 2: Service Layer (`apps/web/app/services/notification.service.ts`)
1. Implement `notificationService`:
   - `listNotifications(ctx: RequestContext, query?: { page?: number; pageSize?: number }): Promise<{ notifications: Page<NotificationDto>; unreadCount: number }>`
   - `markRead(ctx: RequestContext, notificationId: string): Promise<void>` (A28: verify user owns row, 404 if not found or belongs to another user)
   - `markAllRead(ctx: RequestContext): Promise<void>` (A28: single update scoped to `ctx.user.id`)
2. Integration tests in `apps/web/test/notification/notification.service.test.ts`:
   - FR-25 c1: lists caller's notifications newest first with unread count; does not show other users' notifications.
   - FR-25 c2: markRead marks single notification as read; markAllRead marks all caller's notifications read.
   - A28 cross-user security: marking another user's notification returns 404 and leaves that notification unchanged.
   - Idempotency: marking an already-read notification is a success and doesn't throw.

### Task 3: Route, Action, Loader, UI & E2E
1. Loader and Action in `apps/web/app/routes/_app.notifications.tsx`:
   - Loader requires user, parses query, calls `notificationService.listNotifications`.
   - Action handles `markRead` and `markAllRead`.
2. UI component rendering notifications list, unread badges, mark-read buttons, "Mark all as read" button, and links.
3. Unit tests in `apps/web/test/notification/notificationsRoute.test.ts`.
4. Playwright E2E journey in `apps/web/e2e/notificationCenter.spec.ts`:
   - FR-25 c1..c3: user receives notifications (task assignment, comment), sees newest first with unread badge, marks individual notification read, marks all read, and clicking notification on inaccessible/deleted task gets 404.

### Task 4: Verification & Git Protocol
1. Verify `vitest` unit/integration suite (`pnpm exec vitest run --maxWorkers=2`).
2. Verify `pnpm build`.
3. Run Playwright E2E tests (`CI=1 pnpm test:e2e`).
4. Commit per Conventional Commits (no agent names, no co-authors, ≤72 chars header).
5. Push through Husky hooks, open PR into `develop`, verify CI checks, auto-merge per §3.6.
6. Pull `develop`, verify `develop` CI green, update `docs/wbs.md` row `1.29`.
