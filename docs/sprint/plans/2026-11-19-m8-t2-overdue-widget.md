# M8-T2 Overdue Tasks Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Overdue Tasks Widget for FR-34 criteria 1–2 on the dashboard, displaying the user's overdue tasks sorted most overdue first with days overdue in `APP_TIMEZONE`, dropping Done or archived tasks on reload.

**Architecture:** Domain helper `calculateDaysOverdue(dueDate, now)` in `packages/domain/src/dates.ts`; `dashboardService.getPersonalDashboard` maps and sorts overdue tasks into `OverdueItem[]`; `_app._index.tsx` and `_app.admin._index.tsx` render the overdue tasks widget.

**Tech Stack:** React Router v8, `@pm/domain`, `@pm/db`, Vitest, Tailwind CSS.

**Spec:** `docs/01-srs.md` FR-34, P19; `docs/06-routes-and-actions.md` §3.2.

## Global Constraints
- `APP_TIMEZONE` is `Asia/Ho_Chi_Minh` (fixed UTC+7).
- Overdue criteria per P19: `dueDate < todayStr`, `statusCategory != 'DONE'`, `deletedAt == null`.
- Sorting: most overdue first (highest `daysOverdue` descending).
- Done and archived tasks must never appear.

---

### Task 1: Domain Helper `calculateDaysOverdue`
- **Files:**
  - Modify: `packages/domain/src/dates.ts`
  - Modify: `packages/domain/src/types/dashboard.ts`
  - Test: `packages/domain/test/dates.test.ts`
- **Interfaces:**
  - `calculateDaysOverdue(dueDateStr: string, now?: Date): number`
  - `OverdueItem`: `{ id: string; projectId: string; projectCode?: string; projectName?: string; number: number; title: string; dueDate: string; daysOverdue: number; priority?: TaskPriority; statusName?: string }`

### Task 2: Service Layer & Overdue Population
- **Files:**
  - Modify: `apps/web/app/services/dashboard.service.ts`
  - Create: `apps/web/test/dashboard/overdueWidget.test.ts`
- **Tests:**
  - Test FR-34 c1: lists overdue tasks most overdue first with days overdue computed in `APP_TIMEZONE`.
  - Test FR-34 c2: task that becomes Done drops out on reload.
  - Test FR-34 c2: task that becomes archived drops out on reload.

### Task 3: UI Overdue Tasks Widget
- **Files:**
  - Modify: `apps/web/app/routes/_app._index.tsx`
  - Modify: `apps/web/app/routes/_app.admin._index.tsx`
- **Verification:**
  - Check UI rendering of `data-testid="overdue-widget"` when overdue tasks exist and when none exist.
