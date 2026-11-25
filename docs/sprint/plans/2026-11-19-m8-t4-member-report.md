# M8-T4 Implementation Plan: Member Report (FR-30)

## 1. Requirements & Acceptance Criteria
- **FR-30 c1:** Given a project and an optional date range and sprint, When a lead opens the member report, Then each member shows counts of assigned tasks by category, an overdue count, and the number of tasks completed in the range. Aggregate in SQL (`GROUP BY`), not in JS loops.
- **FR-30 c2:** Given a project MEMBER, When they open the report, Then they receive 403 Forbidden.
- Non-members receive 404 (P3).
- Leads are project `PM`, `TEAM_LEAD`, or system `ADMIN`.

## 2. Architecture & Design
- **Domain (`packages/domain`)**:
  - `MemberReportRow`: `{ userId, fullName, email, avatarKey, projectRole, todoCount, inProgressCount, reviewCount, doneCount, totalAssigned, overdueCount, completedInRangeCount }`
  - `MemberReportFiltersSchema`: Zod schema for `sprintId`, `from`, `to`.
- **Database (`packages/db`)**:
  - `reportRepository.getMemberReport(db, { projectId, sprintId?, fromMs?, toMs?, todayStr })`:
    - One atomic `SELECT ... FROM project_members ... GROUP BY project_members.user_id` query.
    - Aggregates category counts, overdue count, completed in range count in SQL.
- **Service (`apps/web/app/services/report.service.ts`)**:
  - `getMemberReport(ctx, projectId, filters)`:
    - Verifies project access via `loadProjectAccess(ctx, projectId)` (404 for non-members).
    - Checks `canViewMemberReport(actor)` (throws 403 `ForbiddenError` for MEMBER).
    - Resolves `fromMs`, `toMs`, `todayStr`.
    - Queries via `reportRepository.getMemberReport`.
- **Route (`apps/web/app/routes/_app.projects.$projectId.reports.tsx`)**:
  - Checks permissions: if `!canViewMemberReport && !canViewProjectReport`, throws 403.
  - If requested tab is `members` (or default when authorized): loads `memberReport`.
  - Filters toolbar: Sprint dropdown, Date range (from / to), Apply / Clear buttons.
  - Member report table: Member, Role, To Do, In Progress, Review, Done, Total, Overdue, Completed in Range.
- **Tests**:
  - Repository test in `packages/db/test/reportRepository.test.ts` verifying SQL `GROUP BY` aggregation, empty sprint, overdue calculation, and range completion.
  - Service test in `apps/web/test/report/reportService.test.ts` verifying FR-30 c1 and FR-30 c2 (403 for MEMBER).
  - Route test in `apps/web/test/report/reportsRoute.test.ts` verifying 403 for member, 200 for PM/Lead/Admin, and filter preservation.
  - 404 sweep test update to include `/projects/:projectId/reports`.
