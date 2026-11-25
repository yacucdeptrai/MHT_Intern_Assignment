# M8-T3 Implementation Plan: Calendar View (FR-35)

## 1. Requirements & Acceptance Criteria
- **FR-35 c1:** Tasks with both a start date and a due date show as spans. Tasks with only a due date show on that day. Tasks with no dates are not shown.
- **FR-35 c2:** Project filter limits tasks to that project. Filter is limited to projects the user can access. Non-accessible project returns 404 (P3).
- **FR-35 c3:** User switches between day, week, and month views. View and date selections stay in the URL (`?view=...&date=...&projectId=...`).
- Dates are `YYYY-MM-DD` in `APP_TIMEZONE` (`Asia/Ho_Chi_Minh`).

## 2. Architecture & Design
- **Domain (`packages/domain`)**:
  - `CalendarView`: `"day" | "week" | "month"`
  - `CalendarEvent`: `{ id, projectId, projectCode, projectName, number, title, priority, statusId, statusName, statusCategory, startDate, dueDate, isSpan }`
  - `CalendarLoaderData`: `{ view: CalendarView, date: string, range: { from: string, to: string }, events: CalendarEvent[], projects: Array<{ id: string, code: string, name: string }>, selectedProjectId?: string }`
  - `CalendarQuerySchema`: Zod schema for query-string parameters (`view`, `date`, `projectId`).
  - `getCalendarRange(view, dateStr)` in `dates.ts`.
  - Date navigation helpers: `getCalendarNavDates(view, dateStr)`.
- **Database (`packages/db`)**:
  - `taskRepository.listCalendarTasks(db, { from, to, projectId?, allowedProjectIds? })`:
    - Filters: non-archived projects (`status = 'ACTIVE'`, `deletedAt IS NULL`), non-deleted tasks (`deletedAt IS NULL`), `dueDate IS NOT NULL`, `dueDate >= from`, and `COALESCE(startDate, dueDate) <= to`.
    - Uses `idx_tasks_due` on `tasks(due_date) WHERE deleted_at IS NULL`.
- **Service (`apps/web/app/services/calendar.service.ts`)**:
  - `getCalendarData(ctx, query: CalendarQuery)`:
    - If `projectId` provided: calls `loadProjectAccess(ctx, projectId)` (throws 404 if non-member/inaccessible).
    - If `projectId` not provided: loads accessible projects for user (Admin: all active, Member: memberships).
    - Resolves `range` via `getCalendarRange(view, date)`.
    - Queries tasks via `taskRepository.listCalendarTasks`.
    - Maps into `CalendarEvent`s with `isSpan: Boolean(startDate && dueDate)`.
- **Loader & Route (`apps/web/app/routes/_app.calendar.tsx`)**:
  - `loader`: parses search params, calls `calendarService.getCalendarData(ctx, parsedQuery)`.
  - UI:
    - View selector: Day / Week / Month buttons linking to `?view=...&date=...&projectId=...`.
    - Date navigator: Prev (`←`), Today, Next (`→`) buttons with date display.
    - Project filter dropdown: `<select>` updating `?projectId=...`.
    - Calendar grid / event list:
      - Day view: hourly/timeline list for the single day.
      - Week view: 7 day columns (Mon-Sun) displaying single day events and spanning event bars.
      - Month view: month grid cells displaying events on their respective days or spanning across days.
- **Tests**:
  - Unit tests for date range calculations and span overlap.
  - Repository tests verifying `listCalendarTasks` and `EXPLAIN QUERY PLAN` showing `idx_tasks_due` usage.
  - Service tests for FR-35 c1 (spans, single-day, no-date excluded), FR-35 c2 (project filter, 404 for non-accessible project), FR-35 c3 (view and date query handling).
  - Route tests in `apps/web/test/calendar/calendarRoute.test.ts`.
  - 404 sweep update to include `/calendar?projectId=:projectId`.
