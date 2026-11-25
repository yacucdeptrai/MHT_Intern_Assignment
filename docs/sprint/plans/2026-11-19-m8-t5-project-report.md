# Implementation Plan: M8-T5 Project Report (FR-31)

## Requirements & Scope
- **SRS**: FR-31 c1–4, P11 (sprint completion), P21 (bottlenecks).
- **Access Control**: Admin or Project `PM` only (`canViewProjectReport`). Project `TEAM_LEAD` and `MEMBER` receive **403 Forbidden**. Non-members receive **404 Not Found**.
- **Metrics & Structure**:
  1. **Task Completion**: Share of tasks Done (`doneCount / totalCount`).
  2. **Status Distribution**: Task count and percentage distribution across all project statuses.
  3. **Sprint Completion (P11)**: Done top-level tasks / all non-archived top-level tasks per sprint; empty sprints display `"No tasks"` instead of `0%` (FR-31 c2).
  4. **Bottlenecks (P21)**:
     - **Stale Reviews (FR-31 c3)**: Tasks in `REVIEW` status for more than 2 days (`status_changed_at < now - 48h`).
     - **Overdue by Status**: Non-done overdue tasks grouped by status.
     - **Status Distribution**: Cross-cutting backlog visualization.

## Technical Plan

### 1. Domain Types (`packages/domain/src/types/report.ts`)
Define:
- `StatusDistributionItem`: `{ statusId, statusName, category, position, count, percentage }`
- `StaleReviewItem`: `{ taskId, taskNumber, title, statusId, statusName, statusChangedAt, daysInReview, assignees: Array<{ id, fullName, email, avatarKey }> }`
- `OverdueByStatusItem`: `{ statusId, statusName, category, overdueCount }`
- `SprintCompletionItem`: `{ sprintId, sprintName, startDate, endDate, status, taskCount, completedCount, completionRate }`
- `ProjectReportDto`: `{ totalTasks, doneTasks, completionRate, statusDistribution, sprintCompletion, bottlenecks: { staleReviews, overdueByStatus } }`

### 2. Repository Layer (`packages/db/src/repositories/report.repository.ts`)
- Implement `getProjectReportData(db, options: { projectId, todayStr, staleThresholdMs })`:
  - Single/efficient SQL queries aggregating:
    - Status distribution: `SELECT s.id, s.name, s.category, s.position, count(t.id) ... FROM task_statuses s LEFT JOIN tasks t ... GROUP BY s.id ORDER BY s.position ASC`
    - Overdue grouped by status: `SELECT s.id, s.name, s.category, count(t.id) ... WHERE t.due_date < todayStr AND s.category != 'DONE' GROUP BY s.id`
    - Stale reviews: tasks in category `'REVIEW'` with `status_changed_at <= staleThresholdMs` joined with assignees.
- Add `EXPLAIN QUERY PLAN` test verifying `idx_tasks_status` and `idx_tasks_project_status`.

### 3. Service Layer (`apps/web/app/services/report.service.ts`)
- Add `getProjectReport(ctx: RequestContext, projectId: string): Promise<ProjectReportDto>`.
- RBAC check: `const actor = toActor(ctx.user, access); if (!canViewProjectReport(actor)) throw new ForbiddenError("Insufficient permissions");`
- Fetch sprint stats using `sprintService.listSprints(ctx, projectId)` (already implementing P11 / empty sprint rule).
- Fetch project aggregation data from `reportRepository`.

### 4. Loader & Route (`apps/web/app/loaders/projectReportsLoader.ts` & `apps/web/app/routes/_app.projects.$projectId.reports.tsx`)
- In `projectReportsLoader`: when `activeTab === "project"`, load `projectReport = await reportService.getProjectReport(ctx, projectId)`.
- In `_app.projects.$projectId.reports.tsx`:
  - Render Project tab containing:
    - KPI cards: Total Tasks, Done Tasks, Completion Rate.
    - Status Distribution breakdown.
    - Sprint Completion cards/table with `"No tasks"` badge.
    - Bottlenecks panel:
      - Stale Reviews table (with days in review badge and assignees).
      - Overdue tasks by status.

### 5. Verification & TDD
- Write failing unit tests in `packages/db/test/reportRepository.test.ts` and `apps/web/test/report/reportService.test.ts`.
- Run vitest, build, and E2E verification.
- Push and open PR, await green CI, merge per §3.6.
