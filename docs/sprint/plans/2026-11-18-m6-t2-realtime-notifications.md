# Plan: M6-T2 Realtime Notifications (FR-26 c1..c3, UserNotificationHub)

## 1. Requirements & Scope
- **SRS FR-26 (Realtime Notifications)**:
  - **FR-26 c1**: Given a user with an open page, When a notification for them commits, Then it appears within 2 seconds, and the unread count updates.
  - **FR-26 c2**: Given a dropped connection, When the client reconnects, Then it refetches unread notifications, so nothing created during the outage is missed.
  - **FR-26 c3**: Given an unauthenticated request to the realtime endpoint, When it connects, Then the upgrade is refused with 401.
- **Durable Object & Hibernation (`UserNotificationHub`)**:
  - `apps/web/worker/notificationHub.ts`:
    - One SQLite-backed DO per user: `env.NOTIFICATION_HUB.idFromName(userId)`.
    - Uses Cloudflare WebSocket Hibernation API:
      - `ctx.acceptWebSocket(serverSocket, [userId])`
      - `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'))`
      - Handles `webSocketClose` and `webSocketError`.
    - RPC method `publish(dto: NotificationDto): Promise<void>`:
      - Broadcasts `{ type: "notification", notification: dto }` to all open sockets of that user via `this.ctx.getWebSockets()`.
- **WebSocket Upgrade Endpoint (`/api/realtime`)**:
  - `apps/web/app/routes/api.realtime.ts`:
    - Checks `Upgrade: websocket`.
    - Validates session with `requireUser(ctx, request)` (returns 401 without session).
    - Checks `Origin` header against `ctx.env.APP_BASE_URL` (returns 403 on cross-origin mismatch).
    - Strips client-supplied headers (e.g. `x-user-id`) to prevent spoofing.
    - Gets DO via `ctx.env.NOTIFICATION_HUB.idFromName(user.id)` and forwards the upgrade request.
- **Publishing & Error Swallowing (`publishNotifications`)**:
  - `apps/web/app/services/notification.service.ts`:
    - `publishNotifications(ctx: RequestContext, notificationIds: string[]): Promise<void>`:
      - Loads notifications from DB, groups by `userId`.
      - Calls `hub.publish(dto)` for each recipient.
      - Catches errors, logs with context, and never throws / rolls back originating requests.
- **Wire 6 Markers**:
  - `projectMember.service.ts` (A4 `PROJECT_MEMBER_ADDED`)
  - `task.service.ts` (A14 `TASK_ASSIGNED`)
  - `task.service.ts` (A17 `TASK_ASSIGNED`)
  - `task.service.ts` (A18 `TASK_APPROVED`)
  - `task.service.ts` (A19 `TASK_REJECTED` / `TASK_REOPENED`)
  - `comment.service.ts` (A21 `TASK_COMMENTED`)
  - Ensure `git grep "TODO(M6-T2)"` returns empty.
- **Client Realtime Connection & Refetch**:
  - Hook / component in `MemberShell` and `AdminShell`:
    - Connects to `/api/realtime`.
    - Reconnects with exponential backoff (1s, 2s, 4s, 8s, 16s... max 30s).
    - On reconnect: triggers revalidation (refetches unread notifications).
    - On receiving notification message: triggers revalidation.
- **Tests**:
  - Unit/integration tests for DO hub, `/api/realtime` route security, and `publishNotifications`.
  - Playwright E2E journey verifying realtime notification reception without reloading.

## 2. Execution Steps
1. In `packages/db/src/repositories/notification.repository.ts`, add `findByIds(db, ids)`.
2. Implement `UserNotificationHub` in `apps/web/worker/notificationHub.ts`.
3. Implement `/api/realtime` in `apps/web/app/routes/api.realtime.ts`.
4. Implement `publishNotifications` in `apps/web/app/services/notification.service.ts`.
5. Wire all 6 publish points.
6. Add client-side realtime notification listener in web layout shell.
7. Write unit and route tests.
8. Write E2E journey test.
9. Verify all checks, open PR, and auto-merge per §3.6.
