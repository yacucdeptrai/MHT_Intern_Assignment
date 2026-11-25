# Testing Strategy

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [RBAC & workflow](./05-rbac-and-workflow.md) · [Data access & atomicity](./04-data-access-and-atomicity.md) · [Background jobs](./07-background-jobs-and-integrations.md) · [Dev environment](./08-dev-environment-and-deployment.md)

---

## 1. Test Pyramid

| Layer | Tool | Runtime | Location | What it covers |
| :--- | :--- | :--- | :--- | :--- |
| **Domain unit** | Vitest | Node | `packages/domain/test/**/*.test.ts` | Policies, `assertTransitionAllowed`, `isOverdue` / `isDueSoon` / `isTodayPriority`, `sprintCompletionRate`, Zod schemas, error classes |
| **Repository integration** | Vitest + `@cloudflare/vitest-plugin` | workerd with local D1 | `packages/db/test/**/*.test.ts` | Queries, soft-delete filtering, constraints (CHECK, composite FKs, unique), `conflictGuardStmt`, number allocation |
| **Service and action integration** | Vitest + `@cloudflare/vitest-plugin` | workerd with local D1, R2, Durable Objects | `apps/web/test/**/*.test.ts` | Authorization through `loadProjectAccess` and policies, atomic batches, outbox, cron handlers, action validation and response shapes |
| **End to end** | Playwright | Chromium against `pnpm preview` | `apps/web/e2e/*.spec.ts` | The critical journeys in §5 |

**Coverage gate (`pnpm test:coverage`):** at least 80% line coverage for `packages/domain`, `packages/db`, and `apps/web/app/services`, enforced per directory in each Vitest config. Routes and components are covered by E2E tests and are not part of the gate.

**Every PR** adds or updates tests for what it changes. A bug fix starts with a test that fails before the fix.

## 2. Test Data and Isolation

- `@cloudflare/vitest-plugin` runs each test file with **isolated storage**. D1, R2, and Durable Object state written in one test is rolled back before the next.
- Migrations are applied once per run with `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` in the pool's setup file. The migrations list comes from `readD1Migrations` in `vitest.config.ts`.
- **Factories** in `apps/web/test/factories.ts` and `packages/db/test/factories.ts` create rows with explicit overrides: `createUser({ systemRole: 'PM' })`, `createProject({ members: [[user, 'TEAM_LEAD']] })`, `createTask({ project, status: 'REVIEW', createdBy, assignees })`. Tests never depend on seed data.
- **Time:** services take `now` from `ctx.clock.now()`. Tests use a fixed clock (`2026-03-10T03:00:00Z`, a Tuesday at 10:00 in `APP_TIMEZONE`), so overdue and due-soon results are deterministic.
- **External calls:** Slack `fetch` is intercepted with `fetchMock` from `cloudflare:test`. Email uses an in-memory `EmailSender` that records messages.

## 3. Required Test Suites

### 3.1 Permission matrix (table-driven)

Every cell of [RBAC §3.2](./05-rbac-and-workflow.md#permission-matrix) becomes one test case. Each case is checked at both levels:
- **policy level:** `packages/domain`, a pure call with an `ActorContext`
- **service level:** `apps/web`, a real call that must succeed, or throw `ForbiddenError` (403) or `NotFoundError` (404)

```typescript
// apps/web/test/permissions/task.permissions.test.ts
type Actor = 'admin' | 'projectPm' | 'projectLead' | 'creator' | 'assignee' | 'otherMember' | 'nonMember';
type Expected = 'allow' | 403 | 404;

const archiveCases: Array<[Actor, Expected]> = [
  ['admin', 'allow'], ['projectPm', 'allow'], ['projectLead', 'allow'], ['creator', 'allow'],
  ['assignee', 403], ['otherMember', 403], ['nonMember', 404],
];

describe.each(archiveCases)('archiveTask as %s', (actor, expected) => {
  it(`returns ${expected}`, async () => {
    const world = await buildTaskWorld();               // project, task in a `TODO`-category status, one user per Actor
    const ctx = contextFor(world.users[actor]);
    const run = () => taskService.archiveTask(ctx, { projectId: world.project.id, taskId: world.task.id, version: 1 });
    if (expected === 'allow') await expect(run()).resolves.toBeDefined();
    else await expect(run()).rejects.toMatchObject({ status: expected });
  });
});
```

The same structure covers every row in the matrix, plus the system-level table ([RBAC §3.1](./05-rbac-and-workflow.md#31-system-level-actions)) and the invariants (last Admin, last project PM, assignees must be members, no self-lockout).

**Non-member 404 sweep:** a single test iterates over every project-scoped loader and action in [Routes §3.4–3.6](./06-routes-and-actions.md#34-projects-shared-by-both-layouts), calling each as a non-member, and asserts 404 with a response body identical to a missing project's.

### 3.2 Workflow

- `assertTransitionAllowed`: every row of the [transition table](./05-rbac-and-workflow.md#transitions), including every rejected row.
- An editor posting `changeStatus` with a `DONE`-category status gets 403 and the status is unchanged (FR-21 criterion 2).
- Approve from `TODO` gets 400; reject with an empty reason gets 400; reopen from `REVIEW` gets 400.
- Status administration: deleting an in-use status gets 400; setting a default keeps exactly one default per category; deleting the default gets 400.

### 3.3 Atomicity

For **every** entry in the [atomic operations catalog](./04-data-access-and-atomicity.md#atomic-operations):
1. **Happy path:** every listed table has the expected new or changed rows.
2. **Forced failure:** a statement late in the batch is made to fail (for example a duplicate primary key injected through a factory, or a CHECK violation). Then assert that **no row changed in any table the operation touches**, by comparing table snapshots before and after.
3. **Version conflict** (operations with a guard): call with a stale `version`. Assert `ConflictError` (409) and that zero rows were written, so no audit entry, notification, or outbox job appears.

4. **Empty lists** ([Data access §3.2](./04-data-access-and-atomicity.md#32-empty-statement-lists)): create an unassigned task (A14), approve where the approver is the only assignee (A18), and comment on a task where the author is the only creator and assignee (A21). Each succeeds, with no notification rows.
5. **Unguarded zero-row writes:** archive an empty sprint (A13), remove a member with no assignments (A5), and archive a task with no sub-tasks (A20). Each succeeds with no 409.

`packages/db/test/batch.test.ts` pins the guard mechanism itself (risk R5):
- `conflictGuardStmt` after a 0-row update aborts the batch.
- `isVersionConflict` recognizes the error.
- `changes()` refers to the preceding statement inside a Drizzle D1 batch.

### 3.4 Background jobs

| Test | Assertion |
| :--- | :--- |
| Claim race | Two `claimStmt` runs on the same job: exactly one returns `changes() = 1` |
| Backoff | Failures 1–4 set `next_attempt_at` to now + 1, 2, 4, and 8 minutes |
| Dead after max attempts | The 5th failure sets `DEAD` and logs at `error` level |
| Skipped when unconfigured | No `SLACK_BOT_TOKEN`, or no project channel → `SKIPPED`, no `fetch` call |
| Stuck recovery | A `RUNNING` job with `updated_at` 11 minutes ago is reset to `FAILED` by `sweepOutbox` |
| Slack post idempotency | Running `SLACK_POST_TASK` twice posts once and stores `slack_thread_ts` once |
| Thread update ordering | `SLACK_UPDATE_THREAD` before the post is `DONE` fails retryably; after the post it replies in the thread |
| Reminder once | Running `runDeadlineScan` twice in the same hour creates one `reminder_log` row and one job per assignee and kind |
| Reminder after due-date change | Changing `due_date` and scanning again produces a new reminder |
| Email failure isolation | An `EmailSender` that throws leaves the business data unchanged, and the job goes to `FAILED` |
| Realtime | Publishing to `UserNotificationHub` delivers to every open socket of that user, and to no other user |
| Unauthenticated realtime | `GET /api/realtime` without a session → 401 |

### 3.5 Domain definitions

- `isOverdue` and `isDueSoon` around the end of the due day in `APP_TIMEZONE` (23:59:59.999), and false for `DONE` or archived tasks.
- `sprintCompletionRate`: empty → `null` ("No tasks"); sub-tasks are excluded; archived tasks are excluded.
- `isTodayPriority`: overdue, due today, or `HIGH`/`URGENT` and not Done.
- Zod: each Create/Update pair accepts the same valid fields ([Routes §4](./06-routes-and-actions.md#4-validation-parity)). Date and code formats; email normalization.

### 3.6 Input edge cases

- Text at the maximum lengths (title 200, description 10,000, comment 5,000) is accepted, and one character more is rejected.
- Emoji and Vietnamese text round-trip in names, titles, and comments.
- Case-insensitive email login and duplicate detection (`User@Example.com` = `user@example.com`).
- An attachment of exactly 10 MB is accepted, and 10 MB + 1 byte is rejected with nothing stored in R2.
- CSV export of a title starting with `=` is prefixed with `'`.
- A `redirectTo` pointing to another origin is ignored after login.

## 4. Action Contract Tests

For every action in [Routes §3](./06-routes-and-actions.md#3-route-catalog):
- Invalid input → 400 `{ success: false, errors }`, with field keys matching the form names.
- Unknown `intent` → 400.
- Success → `{ success: true }` with the documented status (200 or 201).

The client-side contract for review lesson #14 ("only reset the form on success") is covered in the E2E suite (§5, journey 2).

## 5. End-to-End Journeys

Playwright runs against `pnpm preview` with a freshly reset and seeded local D1. Each journey has its own spec file.

| # | Spec | Journey | Key assertions |
| :-- | :--- | :--- | :--- |
| 1 | `auth.spec.ts` | Log in as the seeded Admin; log out; open a deep link while signed out | Lands on `/admin`; the deep link redirects to `/login?redirectTo=…` and returns there after login |
| 2 | `admin-users.spec.ts` | Admin creates a user; tries a duplicate email; locks a user who is signed in elsewhere | The duplicate shows a field error **and keeps the form values**; the locked user is signed out on their next navigation |
| 3 | `project-setup.spec.ts` | PM creates a project and adds the lead and the member | The project appears for the members; the member sees `MemberShell` navigation |
| 4 | `sprint-task.spec.ts` | Lead creates a sprint and a task in it, and assigns the member | The member receives a realtime notification without reloading |
| 5 | `approval.spec.ts` | Member moves the task to Review; lead rejects with a reason; member resubmits; lead approves | The reason appears as a comment; the final status is Done; sprint completion shows 100% |
| 6 | `access.spec.ts` | A user who is not a member opens the project URL and a task URL | Both show the "Not found" page (404) |
| 7 | `done-guard.spec.ts` | Member posts a `changeStatus` with a Done status directly (via `page.request`) | 403; the task status is unchanged |
| 8 | `export.spec.ts` | PM exports CSV; the member tries the export URL | The PM's file downloads with the expected header row; the member gets 403 |

## 6. Review-Lesson Regression Map

Each lesson from [`nativedocs/09-code-review-feedback.md`](./nativedocs/09-code-review-feedback.md) is mapped to the rule that prevents it in this stack and to what proves it.

| # | Lesson | Prevented by | Proven by |
| :-- | :--- | :--- | :--- |
| 01 | Typo in file name (`notificatonRepository`) | `pnpm spell` (cspell covers file names via the `**/*` glob) | CI spell step |
| 02 | Typo in file name (`projectMemeber.service`) | `pnpm spell` | CI spell step |
| 03 | Repository used the global client instead of the injected `db` | [Data access §2](./04-data-access-and-atomicity.md#2-repository-conventions); ESLint `no-restricted-imports` | Lint, plus the atomicity tests (§3.3) |
| 04 | `throw (new AppError(...), 403)` comma operator | ESLint `no-sequences` and `@typescript-eslint/only-throw-error` | Lint; `errors.test.ts` asserts that thrown errors are `AppError` instances with `status` |
| 05 | No input validation in actions | Zod `safeParse` in every action ([Routes §1](./06-routes-and-actions.md#1-conventions)) | Action contract tests (§4) |
| 06 | `any` props in `UserForm` | `@typescript-eslint/no-explicit-any` as an error | Lint, `pnpm typecheck` |
| 07 | Widespread `any` | Same, plus the `no-unsafe-*` rules | Lint |
| 08 | `requireAdmin` redirected to `/` | `requireUser` redirects to `/login?redirectTo=` ([RBAC §5.2](./05-rbac-and-workflow.md#52-guards)) | E2E journey 1 |
| 09 | Magic number for token expiry | `TOKEN_INVITE_EXPIRY_MS` in `packages/domain/src/constants.ts`; ESLint `no-magic-numbers` (warn → error in services) | Lint; the invite expiry test |
| 10 | "Users does not exits" | English review + cspell | CI spell step; review checklist |
| 11 | Meaningless error string ("clib") | Error messages are defined in the SRS acceptance criteria and asserted in tests | Action contract tests |
| 12 | Repository results cast to `any` | Typed repository returns ([Data access §2](./04-data-access-and-atomicity.md#2-repository-conventions)) | Lint, typecheck |
| 13 | Hardcoded `"PROJECT" as const` entity type | `AuditEntityType` enum shared by the domain and the schema CHECK ([Database §1.2](./03-database-design.md#12-enumerations)) | Repository test: an invalid value violates the CHECK |
| 14 | Form reset in `useEffect` regardless of the result | Reset only when `actionData?.success === true` ([Architecture §4.4](./02-architecture.md#44-error-model)) | E2E journey 2 |
| 15 | Hardcoded table scroll height | Tables use the viewport-relative `scroll.y` helper `tableScrollY()` from `components/table/` | Manual review at 1280×720 and 1920×1080 in E2E screenshots |
| 16 | Logs without context | Structured logger with `requestId`, `userId`, target ID ([Architecture §4.5](./02-architecture.md#45-logging)) | `logger.test.ts`; review checklist |
| 17 | `findMany` + `count` without supporting indexes | Index table ([Database §4](./03-database-design.md#4-indexes)); paginated read batches ([Data access §6](./04-data-access-and-atomicity.md#6-reads-and-the-query-budget)) | Repository tests run `EXPLAIN QUERY PLAN` for list queries and assert `USING INDEX` |
| 18 | Complex metadata lookup inside a transaction | Pre-reads happen before the batch; dedicated repository methods ([Data access §8](./04-data-access-and-atomicity.md#8-anti-patterns-from-code-review)) | Code review; the service tests' batch contents |
