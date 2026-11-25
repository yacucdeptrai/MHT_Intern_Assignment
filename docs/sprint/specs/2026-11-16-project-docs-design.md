# Design: Project Engineering Documentation Set

> Date: 2026-11-16
> Status: Revision 3. Revision 2 added the author's decisions on data access, sprints, deployment, monorepo, tenancy, layouts, statuses, and task permissions. Revision 3 adds the coverage fixes from checking against `nativedocs/02`, `03`, and `04`, plus the `wbs.md` tracking rule. **Approved by the author on 2026-11-16.** The author has no objection to the Workers Paid upgrade if it is needed (R1). P7 (reopen) is accepted.
> Source material: `docs/nativedocs/` (Vietnamese, converted from `Tài liệu cho intern_Hoành_Anh.xlsx`) and `AGENTS.md`

## 1. Intent

The repository holds only requirements and process guides, all in Vietnamese. There is no source code yet. The author (the intern/PIC) will build the whole **Project & Task Management System** alone and end to end: design, code, test, CI, and deploy. The project is a small mock, but it must be built correctly.

This document set is the **build blueprint**. The author should be able to start every task without going back to the source spreadsheet and without making architecture decisions in the middle of coding. Most of the 18 code-review findings in `nativedocs/09` came from design that was never decided (transactions, validation, typing, error handling).

Everything is written in **English**.

## 2. Goals, Non-Goals, Anti-Goals

**Goals**
- One authoritative English source of requirements, with acceptance criteria for each of the 35 functions plus Sprint tracking.
- Every cross-cutting decision written down once: architecture, monorepo layout, data model, data access and atomicity, RBAC, status workflow, routes, background jobs, integrations, pipeline, testing.
- A roadmap that splits the work into PR-sized tasks (under 300 LOC each), in an order that respects dependencies.
- English versions of the process guides, so `docs/` reads entirely in English.
- An explicit register of assumptions, limitations, and open technical risks.

**Non-goals**
- Writing application code, scaffolding, or configuration files. Documents may contain *illustrative* snippets (Drizzle schema drafts, Zod schemas, `wrangler.jsonc` sketches); these are not deliverable code.
- Multi-tenancy, organization switching, and tenant-scoped data.
- Full Scrum management: backlog grooming, story points, sprint planning boards, velocity forecasting.
- Production-grade scale, SLAs, or compliance.
- Rewriting or deleting `docs/nativedocs/`. It stays untouched.

**Anti-goals** (the work fails if any of these happen, even when the documents are complete)
- The documents contradict each other, or contradict `AGENTS.md` without saying so. Every deviation is named as an exception, with the reason.
- "TBD" left where the author will hit the decision while coding.
- The documents imply Prisma-style interactive transactions, MySQL, AWS, or a paid Cloudflare plan as a prerequisite.
- A business write and its dependent records (audit log, notification, outbox job) can end up partially committed.
- Authorization exists only in the UI.
- Agent or AI attribution anywhere in the documents (`AGENTS.md` §0.2).

## 3. Constraints

- **Local-first.** Everything runs locally with Wrangler and local D1, R2, and Durable Objects. Development and tests never require a Cloudflare deployment.
- **Production target:** Cloudflare Workers, on the default `*.workers.dev` URL. No custom domain.
- **Cloudflare Free plan by default.** A paid dependency needs a written justification. Plan limits are documented from Cloudflare's docs (verified 2026-11-16; see §10).
- **Data layer:** Cloudflare D1 (SQLite) through **Drizzle ORM**. Interactive transactions are not assumed to exist.
- **Single monorepo**, with clear dependency boundaries and no circular dependencies.
- **Single organization.**
- Layering, typing, validation, and logging rules in `AGENTS.md` §1.2, §4, and §5 still apply, except where §9 lists an exception.
- Strict TypeScript: no `any`, no unchecked type assertions, and no untyped SQL unless it is documented as unavoidable.

## 4. Approaches Considered

| Topic | Options | Chosen | Why |
| :--- | :--- | :--- | :--- |
| Document structure | **A. Layered engineering set**; B. one document per module; C. minimal | **A** | Each decision lives in exactly one place. B duplicates the cross-cutting rules; C pushes decisions into coding. |
| Hosting | AWS; VPS + Docker; managed container host; **all-Cloudflare** | **All-Cloudflare** | The author's choice: a small mock with one vendor. |
| Database | **D1**; Hyperdrive + external Postgres | **D1** | Free, local-first, and on the same vendor. |
| Data access | Prisma (no D1 transactions); Prisma + raw-SQL batches; **Drizzle + `db.batch`** | **Drizzle** | D1 batches are real SQL transactions (they roll back on failure), and Drizzle builds them with full typing. Data integrity outranks consistency with the reference stack. |
| Background delivery | Cloudflare Queues; `ctx.waitUntil` alone; **outbox table + `waitUntil` + cron sweep** | **Outbox** | See §6.4. A queue send cannot join a D1 batch, so a durable outbox row is needed in any case. Once it exists, Queues adds only a second retry mechanism. Queues remains a documented upgrade path. |
| Monorepo split | Separate frontend and API apps; **one Remix app + shared packages** | **One app + packages** | See §6.1. Remix serves UI and server logic from a single Worker. Splitting them would add a network hop, CORS, and cross-app auth for no benefit. |

## 5. Product Decisions

The SRS records each decision with a pointer to the source it settles.

| # | Topic | Decision |
| :-- | :--- | :--- |
| P1 | Tenancy | One organization only. No `organizationId` columns, no tenant isolation, no org switching. |
| P2 | Roles | Each user has one `systemRole`: `MEMBER`, `TEAM_LEAD`, `PM`, or `ADMIN`. Each `ProjectMember` row has one `projectRole`: `PM`, `TEAM_LEAD`, or `MEMBER`. |
| P3 | Project access | **Admin** can access every project and has PM-equivalent rights in each. **System PM** can access only the projects they are a member of. Creating a project needs system role `PM` or `ADMIN`, and the creator becomes that project's PM. **Everyone else** has access according to membership. Non-members get **404**, so a project's existence does not leak. The check runs in the service layer; a route guard alone does not count. This fixes the WBS bug where non-members could view projects. |
| P4 | Layouts | The layout follows the **system role**: `_admin` for `ADMIN` and `PM`, `_member` for the rest. **Project pages are shared** by both layouts. They render controls from the user's project role and permissions, which the loader computes on the server. An unauthenticated request redirects to `/login?redirectTo=…` (`AGENTS.md` §5.5). |
| P5 | Statuses | Statuses are **system-wide** and admin-managed (FR-20). Each status belongs to exactly one fixed **category**: `TODO`, `IN_PROGRESS`, `REVIEW`, or `DONE`. A category can hold several statuses. Each category has exactly one default status. A status in use by any task, archived tasks included, cannot be deleted; renaming and reordering are allowed. Status and category are separate concepts in both code and UI. The 9 statuses in `nativedocs/01` describe the *team's* progress tracking and live in the process guide. |
| P6 | Transitions | All transitions are validated on the backend. People who can edit a task (P8) may move it between statuses whose category is `TODO`, `IN_PROGRESS`, or `REVIEW`. **No generic update can set a `DONE`-category status.** Only **Approve** can do that: it is allowed from `REVIEW` and performed by project `TEAM_LEAD`, `PM`, or Admin, and it moves the task to the default `DONE` status. **Reject** is allowed from `REVIEW`, by the same roles. It requires a reason and moves the task to the default `IN_PROGRESS` status. Approve and reject each write the status change, an audit entry, a notification, and outbox jobs in **one atomic batch**. |
| P7 | Leaving Done | **Assumption, flagged for confirmation:** a project `TEAM_LEAD`, `PM`, or Admin can reopen a `DONE` task to the default `IN_PROGRESS` status, with a reason. Nobody else can move a task out of `DONE`. |
| P8 | Task permissions | **Create:** any project member. **Edit or move:** the creator, the assignees, and the project's `TEAM_LEAD` or `PM` (Admin included). **Archive:** the creator and the project's `TEAM_LEAD` or `PM`; assignees cannot archive unless they hold one of those roles. **Assign (FR-15):** project `TEAM_LEAD` or `PM`. Comments and attachments: any project member can add them, and only the author (or a project `PM`) can delete. |
| P9 | Deletion | Projects, tasks, and sprints are soft deleted (`deletedAt`), labeled "Archive" in the UI. There is no hard delete in v1. |
| P10 | Onboarding | There is no public sign-up. An Admin creates users, or a project PM invites by email. The invite token is stored hashed and expires in 7 days (`TOKEN_INVITE_EXPIRY_MS`). The invitee sets a password when accepting. The WBS "Sign up" task becomes "Accept invite". Until an email provider is configured, the invite link is shown to the inviter and written to the logs. |
| P11 | Sprints | A `Sprint` belongs to one project and has a name, start date, and end date (end ≥ start). A task can optionally belong to one sprint, which must be in the **same project**. The database enforces this with a composite foreign key, and the service validates it with a clear error. Tasks without a sprint behave normally. Sub-tasks inherit their parent's sprint and are not counted separately. **Completion rate** = number of non-archived top-level tasks in the sprint whose status category is `DONE`, divided by the number of non-archived top-level tasks in the sprint. An empty sprint shows "no tasks", not 0%. Sprint CRUD is done by the project `PM` or `TEAM_LEAD`. Nothing else is added: no sprint states, no carry-over automation. |
| P12 | Sub-tasks | A sub-task is a `Task` row with a `parentTaskId`, one level deep. It shares the parent's project and sprint. |
| P13 | Reports | **FR-30** (member report): project `TEAM_LEAD` or `PM`, scoped to that project. **FR-31** (project report, including sprint completion): project `PM` or Admin. **FR-32** (export): project `PM` or Admin. **FR-24** (audit log viewer): Admin. Project-scoped history is also visible on each task to project members. |
| P14 | i18n | English (default) and Vietnamese. |
| P15 | Users (FR-03, FR-05, FR-06) | `users.status` is `ACTIVE` or `LOCKED`. Users are soft deleted (`deletedAt`), and their tasks, comments, and audit entries are kept, shown as "Deleted user". **Every authenticated request re-reads the user**: a locked or deleted user is signed out on their next request, because a cookie-only session cannot be revoked any other way. Profile fields: full name, email (read-only), phone, `department` (free text; only an Admin edits it), and avatar (R2 `avatars/{userId}`). A user who has only SSO can *set* a password; a user with a password changes it by giving the current one. |
| P16 | Projects (FR-07, FR-08) | Fields: `code` (unique, uppercase, 2–10 characters, immutable after create), name, description/goals, optional `budget` (integer, minor units), `startDate`, `endDate` (end ≥ start), and `status` (`ACTIVE`, `ON_HOLD`, or `COMPLETED`). Project status is separate from Archive (P9). |
| P17 | Task fields (FR-12, FR-35) | Title, description, `priority` (`LOW`, `MEDIUM`, `HIGH`, or `URGENT`; default `MEDIUM`), an optional `startDate`, and an optional `dueDate`. Assignees must be current project members (FR-15). The calendar shows a span when both dates are set, otherwise the due date; tasks with no dates are not shown. |
| P18 | Comments (FR-19) | Threaded one level deep (`parentCommentId`). A reply to a reply attaches to the root comment. |
| P19 | Shared definitions | Defined once in `packages/domain` and used everywhere: **overdue** means `dueDate < now`, the status category is not `DONE`, and the task is not archived. **Due soon** means due within `DUE_SOON_WINDOW_MS`, 24 hours. **Today's priorities** (FR-33) are the user's tasks that are overdue or due today, plus their `HIGH` or `URGENT` tasks that are not Done. |
| P20 | Deadline email (FR-29) | Recipients are the task's assignees, and each reminder kind is sent once per due date. With `ConsoleEmailSender`, this requirement is met in **mock form**: acceptance tests assert that the email was produced and logged, not that it was delivered. |
| P21 | Bottlenecks (FR-31) | The project report shows three things: tasks in a `REVIEW` status for longer than `REVIEW_STALE_MS` (2 days), overdue tasks grouped by status, and the distribution of tasks across statuses. It also shows sprint completion (P11). |

## 6. Technical Decisions

### 6.1 Monorepo layout

pnpm workspaces. No build orchestrator until one is needed.

```
/
├── apps/
│   └── web/                     Remix (Vite) app, deployed as ONE Worker
│       ├── app/
│       │   ├── routes/          kebab-case route modules (thin: call loaders/actions)
│       │   ├── loaders/         *Loader.ts: parse params, call services
│       │   ├── actions/         *Action.ts: Zod safeParse, call services
│       │   ├── services/        *.service.ts: orchestration, authorization, batch assembly
│       │   ├── components/      PascalCase.tsx
│       │   ├── constants/       UPPER_SNAKE_CASE
│       │   └── utils/           session, auth, logger, request context
│       ├── worker/              Worker entry: fetch (Remix), scheduled (cron), Durable Object class
│       ├── e2e/                 Playwright specs
│       └── wrangler.jsonc       environments: local, dev, staging, production
├── packages/
│   ├── domain/                  PURE TypeScript: types, enums, Zod schemas, permission policies,
│   │                            status-transition rules, sprint metrics, error classes.
│   │                            No Cloudflare, Drizzle, or Remix imports.
│   ├── db/                      Drizzle schema, migrations, repositories (injected db), batch helpers
│   └── config/                  shared tsconfig, ESLint, Prettier, cspell presets
├── docs/
└── .github/workflows/
```

**Dependency rule:** `apps/web → packages/db → packages/domain`, and `apps/web → packages/domain`. `domain` depends on nothing internal. ESLint import-boundary rules enforce this, and CI fails on a cycle.

**Why one app:** the user's example listed separate frontend and backend apps. Remix loaders and actions are the backend, served from the same Worker as the UI. Splitting them would add an internal HTTP API, CORS, and token passing for no gain. Business rules that must not depend on infrastructure live in `packages/domain` and are unit-tested without any runtime.

### 6.2 Data access and atomicity

- `drizzle(env.DB)` is created once per request and passed down as `db: AppDatabase`, a named type. **Repositories receive `db` as a parameter** and never import a global.
- Repository methods come in two kinds:
  - **Executing queries** (reads, single writes) return awaited results.
  - **Statement builders** return an un-awaited Drizzle query for a service to put in a batch.
- **Atomic operations** are assembled in services and run with `db.batch([...])`. D1 runs a batch as one SQL transaction and rolls back the whole batch if any statement fails.
- Batches cannot read their own writes between statements. Services therefore:
  1. Generate IDs up front (`crypto.randomUUID()`).
  2. Do read-and-check *before* the batch.
  3. Guard against races with conditional writes: `UPDATE … WHERE status_id = :expected`. The affected-row count is checked after the batch, and the service raises `ConflictError` when it is 0.
- **Operations that must be atomic:** the documents list these in a single table, with a test for each.
  - project create (project + creator membership + audit)
  - member add or remove (+ audit + notification)
  - task create (task + assignees + audit + notification + outbox)
  - task update or move (+ audit + outbox)
  - assign (+ notification + outbox)
  - approve / reject / reopen (+ comment with reason + audit + notification + outbox)
  - archive (+ audit)
  - comment create (+ notification + outbox)
  - attachment record (+ audit)
  - invite accept (user + membership + token consumption)
  - status delete (guarded by an in-use check)
- **Migrations:** `drizzle-kit generate` writes SQL into `packages/db/migrations`, and `wrangler d1 migrations apply` applies it locally and in each environment. Seed scripts provide statuses, an admin user, and demo data.
- **SQLite specifics:**
  - Enums are `text` columns with Drizzle `enum` typing and CHECK constraints.
  - Timestamps are integer epoch milliseconds.
  - Emails are lower-cased before storage, and uniqueness uses `COLLATE NOCASE`.
  - Foreign keys are declared and enforced.
  - Indexes are justified by the queries that need them (review lesson #17).

### 6.3 Request context, errors, logging

- Every loader and action builds a `RequestContext` holding `env`, `db`, `user` (or `null`), a `requestId`, a logger, and `waitUntil`, and passes it to services.
- `AppError` subclasses (`ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409) live in `packages/domain`. One handler maps them to responses (review lesson #4: never `throw (x, 403)`).
- The structured JSON logger always includes `requestId` and `userId`, plus the target ID where there is one (`AGENTS.md` §5.8).

### 6.4 Background jobs: transactional outbox

- An `outbox_jobs` row (`id`, `type`, `payload` JSON, `status`, `attempts`, `nextAttemptAt`, `lastError`, `createdAt`) is written **in the same batch** as the business change. A job therefore exists exactly when its business change committed, and no job is lost when a request dies.
- After the batch commits, the action calls `ctx.waitUntil(dispatch(jobIds))` for an immediate attempt. The HTTP response never waits on it.
- **One cron trigger per environment** (`*/5 * * * *`) does two things. It sweeps pending or failed jobs whose `nextAttemptAt ≤ now`, retrying with exponential backoff up to 5 attempts and then setting `status = DEAD` with a logged error. It also runs the deadline scan on the hourly tick.
  - The Free plan allows only 5 cron triggers per account and there are 3 deployed environments, which is why both jobs share one trigger.
- **Idempotency:**
  - Handlers claim a job atomically with `UPDATE … SET status='RUNNING' WHERE id=? AND status IN ('PENDING','FAILED')`. A zero-row result means another runner has it.
  - The job ID doubles as the external idempotency key where the provider supports one.
  - Slack thread updates are keyed by the stored `slackThreadTs`.
  - The deadline scan records `(taskId, reminderKind, dueDate)`, so a reminder is sent only once.
- **Local:** `wrangler dev --test-scheduled` triggers the cron through `/__scheduled`. The same code paths run locally and in production.
- **Upgrade path:** Cloudflare Queues (available on Free: 10,000 operations per day, 24-hour retention) can replace the sweep as the delivery transport. The outbox stays the source of truth either way.

### 6.5 Realtime notifications

- Notifications are rows in D1, written inside the business batch. **D1 is the source of truth.**
- One Durable Object per user (`UserNotificationHub`, SQLite-backed, which the Free plan supports) holds that user's WebSocket connections through the Hibernation API.
- After commit, the service pushes through `waitUntil`, on a best-effort basis.
- On connect or reconnect, the client refetches its unread notifications, so a missed push is never lost. The WebSocket upgrade route authenticates with the session cookie before handing the connection to the Durable Object.

### 6.6 Integrations

- **Slack:** Web API `chat.postMessage` for a new task, recording the returned `ts` as `slackThreadTs`; replies in that thread on status changes. It runs as outbox jobs. The bot token is a Wrangler secret, and the channel ID is per project. When no token is configured, the handler logs and marks the job `SKIPPED`.
- **Email:** an `EmailSender` interface in `packages/domain`, with implementations in `apps/web`.
  - `ConsoleEmailSender` is the default: it logs the rendered email.
  - A real provider is selected later through `EMAIL_PROVIDER` plus secrets, with no domain needed now.
  - Sends always go through outbox jobs, so an email failure can never roll back or fail a business operation.
  - Every attempt and failure is logged.
- **Files:** an R2 binding. Uploads stream through an authorized action, with a size limit constant of 10 MB. Keys are laid out as `projects/{projectId}/tasks/{taskId}/{attachmentId}`. Downloads go through an authorized resource route; there are no public bucket URLs.
- **SSO:** Google and Microsoft OAuth2 through `remix-auth` strategies. Each environment registers its own `*.workers.dev` redirect URI, and local development uses `http://localhost:5173`.

### 6.7 Auth

- Cookie sessions through `createCookieSessionStorage`, signed with a secret, `HttpOnly`, `Secure`, and `SameSite=Lax`. No KV is needed.
- `requireUser` loads the user from D1 on every request and rejects `LOCKED` or deleted users (P15).
- Server-only modules use the `*.server.ts` suffix. Secrets come only from Worker env bindings, so they never reach browser bundles.
- Passwords use PBKDF2-SHA256 through Web Crypto. The iteration count is a constant and is **stored with each hash**, so it can be raised later without forcing password resets. See risk R1.

### 6.8 UI, validation, testing, pipeline

- **UI:** React with TypeScript, Ant Design (forms, tables), Tailwind (layout), and i18n with `remix-i18next`, in EN and VI.
- **Type checking:** TypeScript runs in strict mode. ESLint bans `any`, `@ts-ignore`, and `@ts-nocheck`; an exception needs Tech Lead approval and an inline justification (`nativedocs/04`). The IDE setup is ESLint, Prettier with format-on-save, and Code Spell Checker, with cspell also run in CI.
- **Validation:** Zod schemas live in `packages/domain`, shared by Create and Update forms (via `.partial()` and `.extend()`), and are parsed with `safeParse` at every action boundary.
- **Testing:**
  - Vitest with `@cloudflare/vitest-pool-workers` for service and repository tests against local D1, with isolated storage per test.
  - Plain Vitest for `packages/domain`.
  - Playwright end-to-end tests against `wrangler dev`.
  - Coverage targets: 80% for `domain`, `db`, and services.
  - **Permission tests:** a table-driven allow/deny test for every role against every permission in §5 P3, P6, P8, P11, and P13.
  - A regression test for each applicable review lesson.
- **CI (GitHub Actions):**
  - Every PR runs install, lint, typecheck, cspell, unit and integration tests, and build.
  - A merge to `develop` deploys to dev, a merge to `staging` deploys to staging, and a merge to `main` deploys to production.
  - Each deploy applies D1 migrations first, then runs `wrangler deploy --env <env>`.
  - Each environment has its own D1 database, R2 bucket, and Durable Object namespace.
  - Secrets live in GitHub Environments and Wrangler secrets.
  - Rollback is `wrangler rollback`. Migrations are forward-only and additive, so code rollback stays safe.

## 7. Document Set

```
docs/
├── README.md                        Index, reading order, precedence rules
├── 01-srs.md                        Requirements, decisions P1–P14, acceptance criteria
├── 02-architecture.md               Runtime, monorepo, layers, request context, errors, logging, AGENTS.md exceptions
├── 03-database-design.md            ERD, tables, constraints, indexes, Drizzle schema draft, migrations, seed
├── 04-data-access-and-atomicity.md  Repository pattern, batch rules, atomic-operation catalog, concurrency guards
├── 05-rbac-and-workflow.md          Roles, project access, permission matrix, layouts, statuses, transitions, approval
├── 06-routes-and-actions.md         Route tree, loaders, actions, Zod schemas, responses, required permissions
├── 07-background-jobs-and-integrations.md  Outbox, cron, retries, idempotency, realtime DO, Slack, email, R2, SSO
├── 08-dev-environment-and-deployment.md    Local setup, commands, wrangler envs, bindings, secrets, CI/CD, rollback, plan limits
├── 09-testing-strategy.md           Test layers, tooling, permission matrix tests, atomicity tests, E2E journeys
├── 10-implementation-roadmap.md     Milestones, PR-sized tasks, dependencies, WBS mapping
├── 11-risks-and-assumptions.md      Assumptions, limitations, open technical risks, verification steps
├── wbs.md                           Tracking sheet: WBS rows (see rule below)
├── guides/
│   ├── status-flow.md               English version of nativedocs/01 (team progress statuses)
│   ├── git-flow.md                  English version of nativedocs/05, adapted to Workers deploys
│   ├── pr-review-rules.md           English version of nativedocs/06
│   ├── pre-push-checklist.md        English version of nativedocs/07, adapted (wrangler secrets, D1 migrations)
│   ├── coding-conventions.md        English version of nativedocs/08, adapted to the monorepo paths
│   └── code-review-lessons.md       English version of nativedocs/09, each lesson linked to the rule that now prevents it
├── superpowers/specs/               This design
└── nativedocs/                      Unchanged originals
```

`nativedocs/04-tech-stack.md` is superseded by documents 02 and 08. Technologies in its catalog that this project does not use (Vue, Next.js, Babylon.js/Three.js, Express/NestJS, GCP, Docker, MySQL/PostgreSQL, Prisma, AWS) are listed in 02 as out of scope. The WBS *task list* from `nativedocs/03-wbs-gantt-chart.md` becomes the rows of `wbs.md`; the roadmap (10) defines the build order and PR breakdown.

**`wbs.md` rule:** the sheet keeps the WBS columns (Category, Task Title, Details, PIC, Sprint, Start Date, Due Date, Estimate (H), Actual (H), Status, Progress %), with rows for 1.0 Coding, 2.0 Fixbug, 3.0 CR, and 5.0 Refactor as in the source, extended with the new rows for Accept invite and Sprints. **The writer fills only `Start Date` (the day work on that row begins) and `Due Date` (the day it is completed), at the time the work happens.** Every other column, including the CR buffer and re-baselining, belongs to the author and is left untouched.

### Contents per document

- **README.md:** purpose, reading order, and precedence: these documents override nativedocs. `AGENTS.md` governs, except where document 02 lists an exception.
- **01-srs.md:** scope and actors; P1–P14; `FR-01`…`FR-35` plus `FR-36` (Sprint management) and `FR-37` (Accept invite). Each FR has a role, user story, Given/When/Then acceptance criteria including denial cases, and a source reference. Non-functional requirements; out of scope.
- **02-architecture.md:** context diagram; monorepo and dependency rule; per-layer responsibilities; request lifecycle for a loader and an action; `RequestContext`; error model; logger contract; the **`AGENTS.md` exceptions** (§9).
- **03-database-design.md:** ERD (mermaid). Every table with columns, types, nullability, defaults, CHECKs, FKs (including the composite sprint/project FK), and indexes with the query each index serves. Soft-delete rules, the Drizzle schema draft, the migration workflow, and seed data.
  - Tables: `users`, `oauth_accounts`, `invites`, `projects`, `project_members`, `sprints`, `task_statuses`, `tasks`, `task_assignees`, `comments`, `attachments`, `audit_logs`, `notifications`, `outbox_jobs`, `reminder_log`.
- **04-data-access-and-atomicity.md:** the `AppDatabase` type; repository conventions (executing vs statement-builder); the batch-assembly pattern with an example (approve task); the pre-read/conditional-write concurrency pattern; the atomic-operation catalog (§6.2); what may and may not happen after commit; anti-patterns, mapped to review lessons.
- **05-rbac-and-workflow.md:** role definitions; project access rules; the full permission matrix (action × system role × project role × task relationship); policy functions in `packages/domain` (pure, unit-tested); where they are enforced (services); the guards (`requireUser`, `requireSystemRole`, `loadProjectAccess`); 404 vs 403 rules; layout selection; status categories; the transition table; approve/reject/reopen flows as sequence diagrams.
- **06-routes-and-actions.md:** the route tree in both layouts plus shared project routes. For each route: loader data, actions with intent names, Zod schema, success and error shapes, required permission. Resource routes for upload, download, export, and the WebSocket upgrade.
- **07-background-jobs-and-integrations.md:** outbox schema and lifecycle (state machine); dispatch, sweep, backoff, dead-letter; idempotency per job type; deadline scan; Durable Object hub protocol (auth, message envelope, reconnect refetch); Slack; `EmailSender` and how to configure a provider later; R2 layout and limits; SSO setup per environment; the Queues upgrade path.
- **08-dev-environment-and-deployment.md:**
  - prerequisites; one-command setup (`pnpm i`, `pnpm db:migrate:local`, `pnpm db:seed:local`, `pnpm dev`); the command reference
  - `wrangler.jsonc` environments and bindings table; `.dev.vars.example` and the secrets list
  - the Cloudflare resources to create per environment; the CI workflows; deploy order (migrate, then deploy); rollback
  - the Free plan limits that apply, and the upgrade triggers
- **09-testing-strategy.md:** test pyramid, tools, data isolation, coverage targets; table-driven permission tests; atomicity tests (inject a failing statement, then assert nothing committed); job idempotency tests; E2E journeys (login; create project; sprint; task lifecycle with approve and reject; non-member 404; member cannot set Done).
- **10-implementation-roadmap.md:** milestones in dependency order. Each is broken into PR-sized tasks with FR IDs, branch name, dependencies, and acceptance check, each mapped to its `wbs.md` row. There are no estimates, dates, or progress fields: those live in `wbs.md` and belong to the author.
  - **M0** monorepo, tooling, CI, Workers skeleton, D1 + Drizzle batch spike
  - **M1** auth, users, invites, SSO
  - **M2** projects, members, access rule
  - **M3** statuses, tasks, sub-tasks, sprints
  - **M4** workflow, approve/reject, audit
  - **M5** comments, attachments
  - **M6** notifications and realtime
  - **M7** outbox, Slack, email, deadline cron
  - **M8** reports, export, dashboard, calendar
  - **M9** hardening, i18n completion, E2E
- **11-risks-and-assumptions.md:** the register in §10, each entry with an owner, a verification step, and a fallback.
- **guides/*.md:** faithful English versions, in the same structure, with mermaid diagrams kept and images referenced from `../nativedocs/images/`. Tooling references are adapted to this stack and marked as adapted.

## 8. Source Gaps Settled

| Source says | Resolution |
| :--- | :--- |
| 9 statuses (`nativedocs/01`) vs 4 (FR-20) | P5 |
| WBS "Sign up" with no matching requirement | P10 |
| Non-member project visibility bug (WBS 2.0) | P3 |
| "Sprint completion rate" (FR-31) with no Sprint entity | P11 |
| `AGENTS.md` "multi-tenant organization workspaces" | P1 |
| FR-12/13/14/21 "All" | P8 |
| FR-03 lock/unlock and delete; FR-05 department | P15 |
| FR-07/08 code, budget, active status | P16 |
| FR-31 "bottlenecks"; "overdue" and "due soon" undefined | P19, P21 |
| `nativedocs/04` catalog items not used here | §7 out-of-scope list |

## 9. Exceptions to `AGENTS.md`

`02-architecture.md` records these, and the plan includes updating `AGENTS.md` to match.

| `AGENTS.md` | Says | Becomes | Why |
| :--- | :--- | :--- | :--- |
| §1 overview | Multi-tenant workspaces | Single organization | P1 |
| §1.1 stack | Prisma, MySQL/PostgreSQL, AWS/GCP, Docker | Drizzle, D1, R2, Workers, Durable Objects; no Docker | Author's decisions |
| §1.2 layout | `src/app/...` | `apps/web/app/...` plus `packages/domain` and `packages/db`; repositories and models move to `packages/db` | Monorepo (§6.1) |
| §5.1 transactions | Interactive `$transaction` with an injected `tx` | Injected `db` stays mandatory. Atomicity comes from `db.batch` assembled in services (§6.2). | D1 has no interactive transactions |
| §5.4 Prisma types | `Prisma.UserGetPayload` | Drizzle `InferSelectModel` / `InferInsertModel` | Drizzle |
| §5.6 charset | `utf8mb4_bin` migrations | N/A on SQLite. Case rules are explicit (`COLLATE NOCASE` on email, binary elsewhere). | D1 |
| §6 checklist #5 | `.env.example` | `.dev.vars.example` plus the Wrangler secrets list | Workers |

## 10. Risks, Limitations, Assumptions

Free plan facts were checked against Cloudflare's docs on 2026-11-16.

| # | Item | Impact | Proposed handling |
| :-- | :--- | :--- | :--- |
| R1 | **Workers Free plan: 10 ms CPU per request.** Password hashing (PBKDF2), SSR of large Ant Design pages, and Excel generation (SheetJS) for large exports can exceed it, which shows up as error 1102. | Login or heavy pages may fail on Free in production. Local development is unaffected. | Measure in M0 and M1. Store the iteration count with each hash and pick the highest count that fits. Keep heavy pages client-rendered where possible. **Upgrade trigger:** if a hash at an acceptable strength cannot fit in 10 ms, move production (only) to Workers Paid at $5/month for its 30 s CPU limit, and record the justification. *This is the one place a paid plan may be technically justified; surfaced for the author's decision.* |
| R2 | Free plan: 50 D1 queries and 50 subrequests per invocation. A batch counts as one query. | Chatty loaders or a large cron sweep could hit the limit. | Loaders batch their reads. The sweep processes at most 20 jobs per tick. |
| R3 | Free plan: 5 cron triggers per account. | Three environments × two schedules would exceed it. | One trigger per environment (§6.4). |
| R4 | Free plan: D1 is 500 MB per database and 10 databases per account. | Ample for a mock. | Three databases (dev, staging, production), plus local. |
| R5 | Drizzle's D1 `batch` typing and atomicity. D1's docs confirm batches are transactions; Drizzle's D1 batch support is documented but needs a version pin. | The core pattern. | The M0 spike proves rollback with a failing statement before any feature work. |
| R6 | R2 activation may require a payment method on file even within the free tier (unverified). | Could block the attachments milestone. | Verify in M0. Fallback: store attachments in D1 as BLOBs up to 1 MB for the mock, behind the same `FileStorage` interface. |
| R7 | `send_email` needs a domain on Cloudflare Email Routing. | No real email now. | `ConsoleEmailSender` by default (§6.6). |
| R8 | The `*.workers.dev` URL for SSO redirect URIs. | Each environment needs its own OAuth app registration. | Documented in 08. SSO is optional locally if credentials are absent. |
| R9 | Remix v2 has been merged into React Router v7. | Long-term maintenance. | Out of scope. The migration is mechanical, noted in 02. |
| A1 | P7 (reopening Done) is an assumption. | Small. | Confirm in review of 05. |
| A2 | Approvers may approve tasks they are assigned to. The source does not forbid this. | Small. | Recorded in the SRS. |

## 11. Left to the Builder

The writing plan will settle these while writing; none of them changes the set's shape:
- Exact column lists and index choices within §6.2's rules.
- Route file names within the convention.
- How much illustrative code each document includes. Keep snippets short and representative.
