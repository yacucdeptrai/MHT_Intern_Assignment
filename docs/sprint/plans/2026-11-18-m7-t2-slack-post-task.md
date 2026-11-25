# M7-T2: Slack Post Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `SLACK_POST_TASK` outbox job handler with Slack `chat.postMessage` integration, formatting (`*<CODE>-<number>* <title>` · Priority: `<priority>` · Due: `<dueDate or "none">` · `<APP_BASE_URL>/projects/<projectId>/tasks/<taskId>`), idempotency via `slack_thread_ts`, unconfigured skipping, and sub-task skipping (FR-27 criteria 1–3).

**Architecture:** The outbox job runner dispatches `SLACK_POST_TASK` through `handleSlackPostTask`. If the bot token or project channel is missing, the job completes as `SKIPPED`. If `slack_thread_ts` is already populated on the task, it returns `DONE` idempotently. On successful post, `tasks.slack_thread_ts` is updated conditionally (`WHERE slack_thread_ts IS NULL`).

**Tech Stack:** Cloudflare Workers, Fetch API, Drizzle ORM, Vitest with mock fetch.

**Spec:** `docs/01-srs.md` (FR-27), `docs/07-background-jobs-and-integrations.md` §5.1, `docs/09-testing-strategy.md` §3.4.

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters.
- Zero AI attribution, no agent names, no `Co-authored-by:` trailers.
- Husky hooks enabled (`.husky/_`); never bypass with `--no-verify`.
- Clean architecture: Database access via repositories; services assemble batches and handle network/external I/O outside batches.

## Review Focus

- Unconfigured skip: Missing `SLACK_BOT_TOKEN` or `project.slackChannelId` must return `SKIPPED` without calling `fetch`.
- Sub-task skip: A task with `parentTaskId != null` must return `SKIPPED` without calling `fetch`.
- Idempotency: When `task.slackThreadTs` is already set, return `DONE` without calling `fetch`.
- Conditional update: When `chat.postMessage` succeeds, update `tasks.slack_thread_ts` conditionally (`WHERE slack_thread_ts IS NULL`).
- Non-retryable Slack errors: `channel_not_found` and `not_in_channel` return `SKIPPED` and log a warning; network/500 errors throw to trigger outbox backoff.

---

### Task 1: Domain Schemas and Repository Method (`@pm/domain`, `@pm/db`)

**Files:**
- Modify: `packages/domain/src/schemas/task.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/src/repositories/task.repository.ts`

**Interfaces:**
- Consumes: `zod`, `tasks`
- Produces: `SlackPostTaskPayloadSchema`, `taskRepository.updateSlackThreadTsStmt`

- [ ] **Step 1: Define `SlackPostTaskPayloadSchema` in `packages/domain/src/schemas/task.ts` and export it**
- [ ] **Step 2: Add `updateSlackThreadTsStmt(db, taskId, ts, now)` in `packages/db/src/repositories/task.repository.ts`**
- [ ] **Step 3: Verify with `pnpm typecheck`**

---

### Task 2: Implement `handleSlackPostTask` in Outbox Service (`@pm/web`)

**Files:**
- Modify: `apps/web/app/services/outbox.service.ts`
- Test: `apps/web/test/outbox/slackPostTask.test.ts`

**Interfaces:**
- Consumes: `JobContext`, `outboxJobRepository`, `taskRepository`, `projectRepository`
- Produces: `handleSlackPostTask(ctx, job): Promise<"DONE" | "SKIPPED">` registered in `jobHandlers.SLACK_POST_TASK`

- [ ] **Step 1: Write failing tests in `apps/web/test/outbox/slackPostTask.test.ts` covering FR-27 c1–3 (successful post + update, unconfigured skip, sub-task skip, idempotency, Slack error handling)**
- [ ] **Step 2: Implement `handleSlackPostTask` in `apps/web/app/services/outbox.service.ts`**
- [ ] **Step 3: Run `vitest` to verify all tests pass**

---

### Task 3: Verification and PR

- [ ] **Step 1: Run `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --maxWorkers=2`, `pnpm build`**
- [ ] **Step 2: Commit: `feat(slack): implement slack post task outbox handler`**
- [ ] **Step 3: Push branch and create PR into `develop`**
- [ ] **Step 4: Await CI green, auto-merge into `develop` per §3.6, pull `develop`, verify develop CI**
