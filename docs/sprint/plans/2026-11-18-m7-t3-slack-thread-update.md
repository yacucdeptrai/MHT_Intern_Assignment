# M7-T3: Slack Thread Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `SLACK_UPDATE_THREAD` outbox job handler with Slack `chat.postMessage` integration in task threads (`thread_ts`), formatting (`Status: <old name> → <new name> by <actor name>`, plus `\nReason: <reason>` when a reason comment is attached), ordering after the initial post (retry if `SLACK_POST_TASK` is pending/running; skip if dead/skipped or unconfigured) (FR-28 criteria 1–2).

**Architecture:** The outbox job runner dispatches `SLACK_UPDATE_THREAD` through `handleSlackUpdateThread`. If the bot token or project channel is missing, the job completes as `SKIPPED`. If `task.slackThreadTs` is not set yet, it inspects the task's `SLACK_POST_TASK` job: if pending/running/failed, it throws a retryable error ("Waiting for original post") so outbox retries after post commits; if dead/skipped or missing, it marks thread update `SKIPPED`. When `slackThreadTs` is present, it looks up the status names, actor name, and optional reason comment, posts to Slack thread, and marks `DONE`.

**Tech Stack:** Cloudflare Workers, Fetch API, Drizzle ORM, Vitest with mock fetch.

**Spec:** `docs/07-background-jobs-and-integrations.md` §3 & §5.1, `docs/04-data-access-and-atomicity.md`.

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters.
- Zero AI attribution, no agent names, no `Co-authored-by:` trailers.
- Husky hooks enabled (`.husky/_`); never bypass with `--no-verify`.
- Clean architecture: Database access via repositories; services assemble batches and handle network/external I/O outside batches.

## Review Focus

- Unconfigured skip: Missing `SLACK_BOT_TOKEN` or `project.slackChannelId` must return `SKIPPED` without calling `fetch`.
- Ordering after post: If `task.slackThreadTs` is null:
  - If `SLACK_POST_TASK` job is `PENDING`, `RUNNING`, or `FAILED`: throw `new Error("Waiting for original post")`.
  - If `SLACK_POST_TASK` job is `DEAD`, `SKIPPED`, or not found: return `SKIPPED`.
- Thread message format:
  - Base: `Status: <fromStatusName> → <toStatusName> by <actorName>`
  - With reason: `\nReason: <reasonText>`
- Post to Slack:
  - `thread_ts: task.slackThreadTs`
  - `channel: project.slackChannelId`
- Error handling:
  - `channel_not_found` or `not_in_channel` returns `SKIPPED` with warning log.
  - Other errors / HTTP >= 500 throw to trigger outbox backoff.

---

### Task 1: Repository Method for Finding Post Job (`@pm/db`)

**Files:**
- Modify: `packages/db/src/repositories/outboxJob.repository.ts`

**Interfaces:**
- Produces: `outboxJobRepository.findSlackPostTaskJob(db, taskId)`

- [ ] **Step 1: Add `findSlackPostTaskJob` in `packages/db/src/repositories/outboxJob.repository.ts`**
- [ ] **Step 2: Add unit tests in `packages/db/test/outboxJobRepository.test.ts`**
- [ ] **Step 3: Verify with `pnpm typecheck`**

---

### Task 2: Implement `handleSlackUpdateThread` in Outbox Service (`@pm/web`)

**Files:**
- Modify: `apps/web/app/services/outbox.service.ts`

**Interfaces:**
- Consumes: `SlackUpdateThreadPayloadSchema`, `outboxJobRepository`, `taskRepository`, `taskStatusRepository`, `userRepository`, `commentRepository`, `projectRepository`
- Produces: `handleSlackUpdateThread` registered in `jobHandlers.SLACK_UPDATE_THREAD`

- [ ] **Step 1: Implement `handleSlackUpdateThread` in `apps/web/app/services/outbox.service.ts`**
- [ ] **Step 2: Register in `jobHandlers.SLACK_UPDATE_THREAD`**
- [ ] **Step 3: Verify with `pnpm typecheck`**

---

### Task 3: Unit and Integration Tests for `SLACK_UPDATE_THREAD` (`@pm/web`)

**Files:**
- Create: `apps/web/test/outbox/slackThreadUpdate.test.ts`

**Test Cases:**
- Status transition posted to Slack with thread_ts and `Status: Old → New by Actor`
- Rejection / reopen appends `\nReason: <reason>` from comment
- Missing token or project channel skips cleanly
- Null `slack_thread_ts` when `SLACK_POST_TASK` is PENDING/RUNNING throws retryable error
- Null `slack_thread_ts` when `SLACK_POST_TASK` is DEAD/SKIPPED returns SKIPPED
- Slack API errors (`channel_not_found`, HTTP 500) handled properly

- [ ] **Step 1: Write `apps/web/test/outbox/slackThreadUpdate.test.ts`**
- [ ] **Step 2: Run vitest on the new suite**
- [ ] **Step 3: Run ESLint, Prettier, and full test suite**
- [ ] **Step 4: Commit and push, open PR, auto-merge when green**
