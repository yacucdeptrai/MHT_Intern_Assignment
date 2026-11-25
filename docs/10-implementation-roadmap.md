# Implementation Roadmap

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [SRS](./01-srs.md) · [Architecture](./02-architecture.md) · [Testing strategy](./09-testing-strategy.md) · [WBS tracking sheet](./wbs.md) · [Git flow](./guides/git-flow.md)

---

## 1. How to Use This Roadmap

- **Order:** milestones `M0`–`M9` are listed in dependency order. Inside a milestone, follow each task's "Depends on" column; tasks with no dependency between them can be done in any order.
- **One task = one branch = one PR**, under 300 changed lines excluding generated migrations and lockfiles ([PR review rules](./guides/pr-review-rules.md)). If a task grows beyond that, split it and note the split in its PR.
- **Done means:**
  - the "Acceptance" check passes
  - the PR's tests are green in CI
  - the [pre-push checklist](./guides/pre-push-checklist.md) is complete
  - the PR is merged into `develop`
- **Tracking:** estimates, dates, status, and progress live only in [`wbs.md`](./wbs.md), and are owned by the PIC. This document holds no dates.
- **Tables arrive with their first writer, but never before the tables they reference.** SQLite cannot add a foreign key to an existing table without a rebuild, which would break the forward-only migration rule. So a table is created by the first task that writes to it, **together with every table its foreign keys point to**, even if that target's features come later. Concretely:
  - M1-T2 creates `audit_logs`, `invites`, and `projects` (schema only; project features start in M2-T1).
  - M3-T2 creates `tasks`, `task_assignees`, and `sprints` (schema only; sprint features start in M3-T8).

  The full schema in [Database design](./03-database-design.md) is the target; migrations reach it step by step.

Branch names follow [Git flow](./guides/git-flow.md): `feature/<name>` for new work, `fix/<name>` for the WBS 2.0 bug fixes.

## M0 — Foundation

**Goal:** an empty but deployable Worker, with the full toolchain and the three technical risks retired before any feature work.
**Entry:** none.

| ID    | Task                                                                                                                                                                                             | FRs | Branch                     | Depends on | Acceptance                                                                                                                                                                                                                                 |
| :---- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-- | :------------------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0-T1 | Monorepo: pnpm workspaces, `@pm/web` (React Router v8 with `@cloudflare/vite-plugin`), `@pm/domain`, `@pm/db`, `@pm/config`; strict TS; ESLint, Prettier, cspell; import-boundary rules; `madge` | n/a | `feature/monorepo-setup`   | n/a        | `pnpm lint && pnpm typecheck && pnpm spell && pnpm deps:check` pass; a deliberate `packages/domain` → `drizzle-orm` import fails lint                                                                                                      |
| M0-T2 | Test harness: Vitest in all packages, `@cloudflare/vitest-plugin` with local D1 migrations, Playwright with one smoke spec, coverage gate                                                        | n/a | `feature/test-harness`     | M0-T1      | `pnpm test` and `pnpm test:e2e` run green on the skeleton                                                                                                                                                                                  |
| M0-T3 | **D1 + Drizzle batch spike (risk R5):** `batch_guard` migration, `conflictGuardStmt`, `isVersionConflict`, and the four proofs                                                                   | n/a | `feature/d1-batch-guard`   | M0-T2      | `packages/db/test/batch.test.ts` proves all four points of [Data access §3.1](./04-data-access-and-atomicity.md#31-the-version-guard). If (4) fails, the fallback is implemented and recorded in [Risks](./11-risks-and-assumptions.md) R5 |
| M0-T4 | **R2 activation check (risk R6):** create the `pm-dev` bucket; `R2FileStorage` put/get/delete integration test locally                                                                           | n/a | `feature/r2-storage`       | M0-T2      | The local test passes. The R6 outcome (payment method needed or not) and the decision are recorded in Risks                                                                                                                                |
| M0-T5 | **PBKDF2 CPU measurement (risk R1):** `hashPassword` / `verifyPassword` with the iteration count stored per hash; measure CPU in a deployed dev Worker                                           | n/a | `feature/password-hashing` | M0-T6      | `PBKDF2_DEFAULT_ITERATIONS` is set from the measurement, and the R1 outcome is recorded                                                                                                                                                    |
| M0-T6 | Worker skeleton plus pipeline: `worker/index.ts` (fetch, scheduled no-op, empty `UserNotificationHub`), `wrangler.jsonc` with 3 envs, `/api/health`, `ci.yml`, `deploy.yml`                      | n/a | `feature/ci-cd-pipeline`   | M0-T1      | A PR runs `ci.yml` green; merging to `develop` deploys, and the smoke check returns `{"ok":true}`                                                                                                                                          |

## M1 — Authentication and Users

**Goal:** people can sign in, admins manage users, invitees join, and both layouts exist.
**Entry:** M0 complete.

| ID    | Task                                                                                                                                                                                          | FRs          | Branch                    | Depends on   | Acceptance                                                                                                                |
| :---- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------- | :------------------------ | :----------- | :------------------------------------------------------------------------------------------------------------------------ |
| M1-T1 | `users` table, session storage, `createRequestContext`, `requireUser` (re-reads the user each request), login/logout, admin seed                                                              | FR-01        | `feature/auth-login`      | M0-T3, M0-T5 | FR-01 criteria 1–4 as service tests; E2E journey 1 (login part)                                                           |
| M1-T2 | `audit_logs`, `invites`, and `projects` (schema only) tables; `/admin/users`: create (with the set-password invite link), edit, lock, unlock, delete; `canManageUsers`; no-self-lockout rules | FR-03        | `feature/user-management` | M1-T1        | FR-03 criteria 1–6; permission cases for `canManageUsers`; A9 and A10 atomicity tests                                     |
| M1-T3 | `outbox_jobs` table; outbox core (claim/finish, `dispatchOutbox`, `EMAIL_INVITE` handler, `ConsoleEmailSender`; Slack handlers return `SKIPPED` until M7); `/invite/:token`                   | FR-37        | `feature/accept-invite`   | M1-T2        | FR-37 criteria 1–4; A7 and A8 atomicity tests (including double acceptance)                                               |
| M1-T4 | System role assignment, with the last-Admin rule                                                                                                                                              | FR-04        | `feature/system-roles`    | M1-T2        | FR-04 criteria 1–3                                                                                                        |
| M1-T5 | `_app` layout with `AdminShell` / `MemberShell`; `/admin` guard; redirects                                                                                                                    | P4           | `fix/separate-layouts`    | M1-T1        | Each system role sees its shell; wrong-layout and no-session redirects per [RBAC §4](./05-rbac-and-workflow.md#4-layouts) |
| M1-T6 | Profile: view, update, change/set password, avatar upload via R2                                                                                                                              | FR-05, FR-06 | `feature/user-profile`    | M1-T5, M0-T4 | FR-05 and FR-06 criteria                                                                                                  |
| M1-T7 | `oauth_accounts` table; Google and Microsoft SSO via `remix-auth`; hidden buttons when unconfigured                                                                                           | FR-02        | `feature/sso-login`       | M1-T1        | FR-02 criteria 1–4, with the providers mocked in integration tests                                                        |

## M2 — Projects and Members

**Goal:** projects exist, membership controls access, and the non-member bug cannot occur.
**Entry:** M1-T1, M1-T2, M1-T5.

| ID    | Task                                                                                                                                  | FRs          | Branch                     | Depends on   | Acceptance                                                                                                              |
| :---- | :------------------------------------------------------------------------------------------------------------------------------------ | :----------- | :------------------------- | :----------- | :---------------------------------------------------------------------------------------------------------------------- |
| M2-T1 | `project_members` table (`projects` exists since M1-T2); create project (A1); `/projects` list                                        | FR-07        | `feature/project-create`   | M1-T2        | FR-07 criteria 1–4                                                                                                      |
| M2-T2 | `loadProjectAccess`, `ActorContext`, project policies in `@pm/domain`; `ProjectPermissions` in loaders; **non-member 404 everywhere** | P3           | `fix/project-visibility`   | M2-T1        | Policy unit tests for every project-level row of the matrix; the 404 sweep test (Testing §3.1) over the existing routes |
| M2-T3 | Project settings: update (A2), archive (A3), Admin archived filter                                                                    | FR-08, FR-09 | `feature/project-settings` | M2-T2        | FR-08 and FR-09 criteria                                                                                                |
| M2-T4 | `notifications` table (insert only); members page: search, add (A4), remove (A5), invite to project (A7)                              | FR-10        | `feature/project-members`  | M2-T2, M1-T3 | FR-10 criteria 1–6                                                                                                      |
| M2-T5 | Change project role (A6), with the last-PM rule                                                                                       | FR-11        | `feature/project-roles`    | M2-T4        | FR-11 criteria 1–3                                                                                                      |

## M3 — Statuses, Tasks, and Sprints

**Goal:** the task model is complete, apart from approval.
**Entry:** M2 complete.

| ID    | Task                                                                                                                                                                       | FRs   | Branch                  | Depends on   | Acceptance                                                                                                                           |
| :---- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---- | :---------------------- | :----------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| M3-T1 | `task_statuses` table and seed; `/admin/statuses` (create, rename, reorder, set default A25, delete A26)                                                                   | FR-20 | `feature/status-config` | M2-T1        | FR-20 criteria 1–5                                                                                                                   |
| M3-T2 | `tasks`, `task_assignees`, and `sprints` (schema only, for the composite FK) tables; per-project number allocation; create task (A14) with an `SLACK_POST_TASK` outbox row | FR-12 | `feature/task-create`   | M3-T1, M2-T2 | FR-12 criteria 1–3; a number-allocation race test; completes A5: remove the member's `task_assignees` on unarchived tasks (FR-10 c4) |
| M3-T3 | `dates.ts` (`isOverdue`, `isDueSoon`, `isTodayPriority`); project task list and `/my-tasks` with URL filters and pagination                                                | FR-16 | `feature/task-list`     | M3-T2        | FR-16 criteria 1–4; domain date tests (Testing §3.5); `EXPLAIN QUERY PLAN` uses indexes                                              |
| M3-T4 | Task detail page; update with version guard (A15)                                                                                                                          | FR-13 | `feature/task-update`   | M3-T2        | FR-13 criteria 1–3, including the 409 conflict                                                                                       |
| M3-T5 | Assign task (A17), with the "assignees must be members" rule                                                                                                               | FR-15 | `feature/task-assign`   | M3-T4, M2-T4 | FR-15 criteria 1–3                                                                                                                   |
| M3-T6 | Archive task and its sub-tasks (A20)                                                                                                                                       | FR-14 | `feature/task-archive`  | M3-T4        | FR-14 criteria 1–2                                                                                                                   |
| M3-T7 | Sub-tasks: create under a parent, one-level rule, progress display                                                                                                         | FR-17 | `feature/sub-tasks`     | M3-T4        | FR-17 criteria 1–3                                                                                                                   |
| M3-T8 | Sprints page (A11–A13; the table exists since M3-T2); task sprint field with the composite FK; `sprintCompletionRate`                                                      | FR-36 | `feature/sprints`       | M3-T4        | FR-36 criteria 1–5; a cross-project sprint is rejected by both the service and the DB                                                |

## M4 — Workflow and Audit

**Goal:** status changes, approval, rejection, reopening, and history.
**Entry:** M3-T4.

| ID    | Task                                                           | FRs   | Branch                      | Depends on | Acceptance                                            |
| :---- | :------------------------------------------------------------- | :---- | :-------------------------- | :--------- | :---------------------------------------------------- |
| M4-T1 | `workflow.ts` (`assertTransitionAllowed`); change status (A16) | FR-21 | `feature/status-transition` | M3-T4      | FR-21 criteria 1–4; every row of the transition table |
| M4-T2 | Approve (A18)                                                  | FR-22 | `feature/task-approve`      | M4-T1      | FR-22 criteria 1–4                                    |
| M4-T3 | Reject and reopen with a reason (A19)                          | FR-23 | `feature/task-reject`       | M4-T2      | FR-23 criteria 1–4                                    |
| M4-T4 | Task history on the task page; `/admin/audit-log` with filters | FR-24 | `feature/audit-log`         | M4-T1      | FR-24 criteria 1–4                                    |

## M5 — Comments and Attachments

**Entry:** M3-T4, M0-T4.

| ID    | Task                                                                               | FRs   | Branch                     | Depends on   | Acceptance                                   |
| :---- | :--------------------------------------------------------------------------------- | :---- | :------------------------- | :----------- | :------------------------------------------- |
| M5-T1 | `comments` table (comments table exists since M4-T3; build on it, do not recreate); threaded comments (A21, A22) with `TASK_COMMENTED` notifications | FR-19 | `feature/task-comments`    | M3-T4, M2-T4 | FR-19 criteria 1–3                           |
| M5-T2 | `attachments` table; upload, download, delete (A23, A24); size and type limits     | FR-18 | `feature/task-attachments` | M3-T4, M0-T4 | FR-18 criteria 1–4; the 10 MB boundary tests |

## M6 — Notifications and Realtime

**Entry:** M2-T4 (the notifications table exists).

| ID    | Task                                                                                                                        | FRs   | Branch                           | Depends on | Acceptance                                                            |
| :---- | :-------------------------------------------------------------------------------------------------------------------------- | :---- | :------------------------------- | :--------- | :-------------------------------------------------------------------- |
| M6-T1 | Notification center: list, unread count, mark read (A28); a link that re-checks access                                      | FR-25 | `feature/notification-center`    | M2-T4      | FR-25 criteria 1–3                                                    |
| M6-T2 | `UserNotificationHub` (Hibernation API), `/api/realtime`, `publishNotifications` after commit, client reconnect and refetch | FR-26 | `feature/realtime-notifications` | M6-T1      | FR-26 criteria 1–3; the realtime tests in Testing §3.4; E2E journey 4 |

## M7 — Outbox Delivery, Slack, and Email

**Entry:** M1-T3 (outbox core), M4-T1.

| ID    | Task                                                                                                                                     | FRs   | Branch                        | Depends on   | Acceptance                                                                                                                                                                                  |
| :---- | :--------------------------------------------------------------------------------------------------------------------------------------- | :---- | :---------------------------- | :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M7-T1 | `sweepOutbox`, stuck-job recovery, backoff, `DEAD`; the `scheduled` handler with the hourly branch                                       | n/a   | `feature/outbox-sweep`        | M1-T3        | The background job tests in Testing §3.4 (claim, backoff, dead, stuck)                                                                                                                      |
| M7-T2 | Slack post handler, with the `slack_thread_ts` idempotency rule                                                                          | FR-27 | `feature/slack-post-task`     | M7-T1        | FR-27 criteria 1–3, with `fetchMock`                                                                                                                                                        |
| M7-T3 | Slack thread update handler, with ordering after the post                                                                                | FR-28 | `feature/slack-thread-update` | M7-T2        | FR-28 criteria 1–2                                                                                                                                                                          |
| M7-T4 | `reminder_log` table; `runDeadlineScan` (A27); due-soon and overdue email templates                                                      | FR-29 | `feature/deadline-email`      | M7-T1, M3-T3 | FR-29 criteria 1–5                                                                                                                                                                          |
| M7-T5 | `cron_state` table; orphan R2 sweep (the `projects/` prefix only, with a resumable cursor) and expired-invite cleanup on the hourly tick | n/a   | `feature/hourly-cleanup`      | M7-T1, M5-T2 | Orphan attachment objects older than 24 hours are removed and newer ones kept; avatars are never touched; the sweep resumes across ticks; invites expired more than 30 days ago are deleted |

## M8 — Reports, Export, Dashboard, Calendar

**Entry:** M4 complete, M3-T8.

| ID    | Task                                                                                                     | FRs   | Branch                       | Depends on   | Acceptance                                                                  |
| :---- | :------------------------------------------------------------------------------------------------------- | :---- | :--------------------------- | :----------- | :-------------------------------------------------------------------------- |
| M8-T1 | Personal dashboard: in progress, today's priorities, unread count; admin dashboard with projects at risk | FR-33 | `feature/personal-dashboard` | M3-T3, M6-T1 | FR-33 criteria 1–2                                                          |
| M8-T2 | Overdue widget                                                                                           | FR-34 | `feature/overdue-widget`     | M8-T1        | FR-34 criteria 1–2                                                          |
| M8-T3 | Calendar view: day, week, month; spans; project filter                                                   | FR-35 | `feature/calendar-view`      | M3-T3        | FR-35 criteria 1–3                                                          |
| M8-T4 | Member report (SQL aggregation)                                                                          | FR-30 | `feature/member-report`      | M4-T2        | FR-30 criteria 1–2                                                          |
| M8-T5 | Project report: completion, distribution, sprint completion, bottlenecks                                 | FR-31 | `feature/project-report`     | M4-T2, M3-T8 | FR-31 criteria 1–4                                                          |
| M8-T6 | Export CSV and `.xlsx`, with formula-injection protection; measure CPU (R1)                              | FR-32 | `feature/data-export`        | M8-T5        | FR-32 criteria 1–3; E2E journey 8; the CPU measurement recorded in Risks R1 |

## M9 — Hardening and Release

**Entry:** M1–M8 complete.

| ID    | Task                                                                                             | FRs    | Branch                     | Depends on  | Acceptance                                                                                                                |
| :---- | :----------------------------------------------------------------------------------------------- | :----- | :------------------------- | :---------- | :------------------------------------------------------------------------------------------------------------------------ |
| M9-T1 | i18n completion: every string in `en.json` and `vi.json`; a CI check for missing keys            | NFR-06 | `feature/i18n-vi`          | M8          | The missing-key check passes; switching language changes every visible string                                             |
| M9-T2 | Full permission matrix and 404 sweep, over every route                                           | NFR-02 | `feature/permission-suite` | M8          | Testing §3.1 complete; every matrix cell has a case                                                                       |
| M9-T3 | All E2E journeys 1–8                                                                             | n/a    | `feature/e2e-journeys`     | M8          | `pnpm test:e2e` green in CI                                                                                               |
| M9-T4 | Review-lesson regression map: confirm every lesson's "Proven by" exists                          | n/a    | `feature/regression-map`   | M9-T2       | Each row of [Testing §6](./09-testing-strategy.md#6-review-lesson-regression-map) points to an existing test or lint rule |
| M9-T5 | Release: `develop` → `staging` → `main` per Git flow; production secrets; production smoke check | n/a    | `release/v1.0.0`           | M9-T1–M9-T4 | Production `/api/health` returns ok; the Admin can sign in on production                                                  |

## 2. Coverage Map

Every requirement appears in exactly one task's FR column, except the cross-cutting NFRs.

| FR    | Task  | FR    | Task  | FR    | Task  |
| :---- | :---- | :---- | :---- | :---- | :---- |
| FR-01 | M1-T1 | FR-14 | M3-T6 | FR-27 | M7-T2 |
| FR-02 | M1-T7 | FR-15 | M3-T5 | FR-28 | M7-T3 |
| FR-03 | M1-T2 | FR-16 | M3-T3 | FR-29 | M7-T4 |
| FR-04 | M1-T4 | FR-17 | M3-T7 | FR-30 | M8-T4 |
| FR-05 | M1-T6 | FR-18 | M5-T2 | FR-31 | M8-T5 |
| FR-06 | M1-T6 | FR-19 | M5-T1 | FR-32 | M8-T6 |
| FR-07 | M2-T1 | FR-20 | M3-T1 | FR-33 | M8-T1 |
| FR-08 | M2-T3 | FR-21 | M4-T1 | FR-34 | M8-T2 |
| FR-09 | M2-T3 | FR-22 | M4-T2 | FR-35 | M8-T3 |
| FR-10 | M2-T4 | FR-23 | M4-T3 | FR-36 | M3-T8 |
| FR-11 | M2-T5 | FR-24 | M4-T4 | FR-37 | M1-T3 |
| FR-12 | M3-T2 | FR-25 | M6-T1 |       |       |
| FR-13 | M3-T4 | FR-26 | M6-T2 |       |       |

## 3. Mapping to the WBS

| WBS group (`wbs.md`)                     | Roadmap                                                                                                               |
| :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| 1.0 Coding: Core "Database design"       | This documentation set ([Database design](./03-database-design.md)); the schema is implemented incrementally in M1–M7 |
| 1.0 Coding: Core "Project setup"         | M0-T1, M0-T2, M0-T6                                                                                                   |
| 1.0 Coding: WEB rows                     | The FR tasks above (see the `Roadmap` column in `wbs.md`)                                                             |
| 2.0 Fixbug: "Project visibility"         | M2-T2 (`fix/project-visibility`)                                                                                      |
| 2.0 Fixbug: "Separate two layouts"       | M1-T5 (`fix/separate-layouts`)                                                                                        |
| 3.0 CR                                   | Owned by the PIC; added to `wbs.md` as change requests arrive                                                         |
| 5.0 Refactor: "Redesign database"        | Designed in from the start ([Database design](./03-database-design.md)); verified by M0-T3 and the constraint tests   |
| 5.0 Refactor: "Reconfigure repositories" | Designed in from the start ([Data access](./04-data-access-and-atomicity.md)); M0-T3                                  |
