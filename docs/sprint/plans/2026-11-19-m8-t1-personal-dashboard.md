# M8-T1 Personal Dashboard & Projects at Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Personal Dashboard (in-progress tasks, today's priorities, unread count) and Admin Dashboard (projects at risk with overdue counts) for FR-33 criteria 1–3.

**Architecture:** Layered Clean Architecture. `projectRepository.listProjectsAtRisk` and `taskRepository.listUserDashboardTasks` run optimized D1 queries; `dashboardService` orchestrates user access, timezone evaluation in `APP_TIMEZONE`, unread notification counts, and domain helper checks; `dashboardLoader` and `adminDashboardLoader` feed `_app._index.tsx` and `_app.admin._index.tsx`.

**Tech Stack:** React Router v8 framework mode, Cloudflare D1 with Drizzle ORM, Vitest, `@pm/domain`, Tailwind CSS.

**Spec:** `docs/01-srs.md` FR-33, P3, P19; `docs/06-routes-and-actions.md` §3.2 & §3.3.

## Global Constraints
- `APP_TIMEZONE` is `Asia/Ho_Chi_Minh` (UTC+7).
- Inactive / archived projects (`deletedAt IS NOT NULL`) and archived tasks (`deletedAt IS NOT NULL`) must never appear.
- Non-accessible projects must never have tasks displayed (FR-33 c2).
- Non-admin on `/admin` receives 403; unauthenticated users redirect to `/login?redirectTo=...`.
- SQL `GROUP BY` must be used for projects at risk; no N+1 queries.
- SQL overdue criteria must match `isOverdue` helper in `packages/domain/src/dates.ts`.

---

### Task 1: Domain Models and Types
- **Files:**
  - Create: `packages/domain/src/types/dashboard.ts`
  - Modify: `packages/domain/src/types/project.ts`
  - Modify: `packages/domain/src/index.ts`
- **Interfaces:**
  - `ProjectRiskItem`: `{ id: string; code: string; name: string; overdueCount: number }`
  - `DashboardLoaderData`: `{ inProgress: TaskListItem[]; todayPriorities: TaskListItem[]; overdue: OverdueItem[]; unreadCount: number }`
  - `AdminDashboardLoaderData`: `DashboardLoaderData & { projectsAtRisk: ProjectRiskItem[] }`

### Task 2: Repository Queries (Projects at Risk & Dashboard Tasks)
- **Files:**
  - Modify: `packages/db/src/repositories/project.repository.ts`
  - Modify: `packages/db/src/repositories/task.repository.ts`
  - Create: `packages/db/test/projectRisk.test.ts`
- **Tests:**
  - Test SQL aggregation and sorting (FR-33 c3).
  - Test SQL vs domain helper `isOverdue` parity, including timezone edge cases (23:30 and 00:30 local time).
  - Test `EXPLAIN QUERY PLAN` showing index usage.

### Task 3: Service Layer (`dashboardService`)
- **Files:**
  - Create: `apps/web/app/services/dashboard.service.ts`
  - Create: `apps/web/test/dashboard/dashboardService.test.ts`
- **Tests:**
  - Test FR-33 c1: user sees IN_PROGRESS tasks, today's priorities (P19), and unread notifications count.
  - Test FR-33 c2: tasks in revoked/archived projects are excluded.
  - Test FR-33 c3: Admin sees all projects at risk; PM sees only member projects.

### Task 4: Loaders and Routes (`/` and `/admin`)
- **Files:**
  - Create: `apps/web/app/loaders/dashboardLoader.ts`
  - Create: `apps/web/app/loaders/adminDashboardLoader.ts`
  - Modify: `apps/web/app/routes/_app._index.tsx`
  - Modify: `apps/web/app/routes/_app.admin._index.tsx`
  - Create: `apps/web/test/dashboard/dashboardRoutes.test.ts`
- **Tests:**
  - Test route loader authorization (Member on `/admin` gets 403; Admin/PM on `/` redirects to `/admin`).
  - Test UI rendering of In-Progress tasks, Today's Priorities, and Projects at Risk.
