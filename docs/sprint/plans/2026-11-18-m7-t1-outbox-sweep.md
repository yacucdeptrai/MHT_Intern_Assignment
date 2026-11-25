# M7-T1: Outbox Sweep, Stuck Job Recovery, and Scheduled Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement robust outbox sweeping with stuck-job recovery, exponential backoff (1, 2, 4, 8 minutes), DEAD status after 5 attempts with structured error logging, concurrent claim protection, and the scheduled cron handler with the hourly branch.

**Architecture:** The outbox processor claims jobs atomically with D1 update-where conditions on `(status, next_attempt_at)` returning affected row count. Failures calculate backoff via `OUTBOX_BACKOFF_BASE_MS * 2^(attempts - 1)` and transition to DEAD upon reaching `OUTBOX_MAX_ATTEMPTS = 5`. The 5-minute cron runner executes stuck-job recovery before processing due jobs and evaluates the hourly branch at UTC minute 0.

**Tech Stack:** Cloudflare Workers, Cloudflare D1, Drizzle ORM, Vitest (`@cloudflare/vitest-plugin`).

**Spec:** `docs/07-background-jobs-and-integrations.md` §1 & §2, `docs/09-testing-strategy.md` §3.4, `docs/10-implementation-roadmap.md` §M7.

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters.
- Zero AI attribution, no agent names, no `Co-authored-by:` trailers.
- Husky hooks enabled (`.husky/_`); never bypass with `--no-verify`.
- Clean architecture: Repositories accept injected `AppDatabase`; services orchestrate logic and batch execution.

## Review Focus

- Claim race: Two runners attempting to claim the same job concurrently must result in exactly one claiming and executing, while the other skips cleanly.
- Backoff progression: Failures 1 through 4 must set `next_attempt_at` to exactly `now + 1m`, `now + 2m`, `now + 4m`, and `now + 8m`.
- Dead after max attempts: On the 5th failure, status must transition to `DEAD` and log at `error` level with operational context.
- Stuck recovery: A `RUNNING` job with `updated_at` older than 10 minutes must be reset to `FAILED` with `next_attempt_at = now`.
- Scheduled handler: The cron trigger must execute `sweepOutbox` on every tick, and execute hourly hooks when `now.getUTCMinutes() === 0`.

---

### Task 1: Repository Enhancements (`@pm/db`)

**Files:**
- Modify: `packages/db/src/repositories/outboxJob.repository.ts`
- Test: `apps/web/test/outbox/outboxSweep.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `outboxJobs`
- Produces: `outboxJobRepository.claimStmt` returning `id` and `attempts`, `outboxJobRepository.recoverStuckStmt`

- [ ] **Step 1: Write failing test for claim race and atomic claim behavior in `outboxSweep.test.ts`**
- [ ] **Step 2: Update `claimStmt` in `outboxJobRepository.ts` to return `{ id: outboxJobs.id, attempts: outboxJobs.attempts }`**
- [ ] **Step 3: Verify tests pass**

---

### Task 2: Outbox Service Core (`@pm/web`)

**Files:**
- Modify: `apps/web/app/services/outbox.service.ts`
- Test: `apps/web/test/outbox/outboxSweep.test.ts`

**Interfaces:**
- Consumes: `outboxJobRepository`, `Logger` from `logger.server.ts`, `OUTBOX_BACKOFF_BASE_MS`, `OUTBOX_MAX_ATTEMPTS`
- Produces: `processJob(ctx, jobId)`, `sweepOutbox(env, now): Promise<SweepResult>`

- [ ] **Step 1: Write failing tests for backoff progression (1m, 2m, 4m, 8m), DEAD on 5th attempt with error logging, and stuck recovery**
- [ ] **Step 2: Implement exact backoff calculation and error logger call on `DEAD` in `processJob`**
- [ ] **Step 3: Update `sweepOutbox` to only increment `claimed` when claim succeeds, and use structured logger**
- [ ] **Step 4: Verify tests pass**

---

### Task 3: Scheduled Cron Trigger and Hourly Branch (`@pm/web` worker)

**Files:**
- Modify: `apps/web/worker/index.ts`
- Test: `apps/web/test/outbox/outboxSweep.test.ts`

**Interfaces:**
- Consumes: `ScheduledController`, `Env`, `ExecutionContext`
- Produces: `scheduledHandler(controller, env, ctx)`

- [ ] **Step 1: Write test for `scheduledHandler` verifying hourly condition (`now.getUTCMinutes() === 0`) and `sweepOutbox` invocation**
- [ ] **Step 2: Implement `scheduledHandler` in `apps/web/worker/index.ts`**
- [ ] **Step 3: Verify all unit and integration tests pass**

---

### Task 4: Full Verification and PR

- [ ] **Step 1: Run repo-wide checks: `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --maxWorkers=2`, `pnpm build`**
- [ ] **Step 2: Commit changes adhering to commit standards**
- [ ] **Step 3: Push branch and open PR into `develop`**
- [ ] **Step 4: Wait for CI green and auto-merge per §3.6**
