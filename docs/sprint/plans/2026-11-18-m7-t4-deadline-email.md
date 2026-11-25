# M7-T4: Deadline Email Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deadline email reminders for tasks that are due soon (within 24 hours) or overdue (past end-of-day in `APP_TIMEZONE`), with idempotency guaranteed by the `reminder_log` table and catalog A27, email delivery via outbox `EMAIL_DEADLINE_REMINDER` and `ConsoleEmailSender`, and hourly scheduling via `runDeadlineScan` (FR-29 criteria 1–5).

**Architecture:**
- `reminder_log` table with composite primary key `(task_id, user_id, kind, due_date)` tracks every reminder already sent or queued.
- `reminderLogRepository.findCandidateTasks`: selects up to 100 candidate `(task, assignee, kind)` rows ordered by `due_date ASC` using `idx_tasks_due`, anti-joining `reminder_log` on `(task_id, user_id, kind, due_date)`.
- Catalog A27: For each candidate, atomically executes `[insertReminderLogStmt, insertJobIfNewStmt]` via `db.batch`. `insertJobIfNewStmt` writes `INSERT INTO outbox_jobs ... SELECT ... WHERE changes() = 1`, enqueuing the outbox job only when `reminder_log` was newly inserted.
- `handleDeadlineEmail`: outbox handler for `EMAIL_DEADLINE_REMINDER`. Validates payload, re-reads task and user to prevent sending on stale data, renders template (due soon / overdue), calls `ConsoleEmailSender.sendDeadlineReminder`, and returns `DONE`.
- `scheduledHandler` in `apps/web/worker/index.ts`: invokes `runDeadlineScan(env, now)` when `now.getUTCMinutes() === 0`, followed by `sweepOutbox` to deliver the new jobs.

**Tech Stack:** Cloudflare Workers, Cloudflare D1 (SQLite), Drizzle ORM, Zod, Vitest.

**Spec:** `docs/07-background-jobs-and-integrations.md` §6, `docs/04-data-access-and-atomicity.md` §4 (A27) & §7, `docs/03-database-design.md` §`reminder_log`, `docs/01-srs.md` FR-29.

---

## Global Constraints

- Conventional Commits: `<type>(<scope>): <subject>` under 72 characters.
- Zero AI attribution, no agent names, no `Co-authored-by:` trailers.
- Husky hooks enabled (`.husky/_`); never bypass with `--no-verify`.
- Clean architecture: Database access via repositories; services assemble batches and handle network/external I/O outside batches.

---

### Task 1: D1 Migration & Schema for `reminder_log` (`@pm/db`, `@pm/domain`)

**Files:**
- Create: `packages/db/migrations/0011_reminder_log.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Create: `packages/db/src/schema/reminderLog.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/domain/src/schemas/task.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Create migration `packages/db/migrations/0011_reminder_log.sql` and update journal**
- [ ] **Step 2: Create Drizzle schema `packages/db/src/schema/reminderLog.ts` and export it**
- [ ] **Step 3: Define `EmailDeadlineReminderPayloadSchema` in `packages/domain` and export it**
- [ ] **Step 4: Verify typecheck with `pnpm typecheck`**

---

### Task 2: Implement `reminderLogRepository` with Catalog A27 (`@pm/db`)

**Files:**
- Create: `packages/db/src/repositories/reminderLog.repository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/test/reminderLogRepository.test.ts`

- [ ] **Step 1: Implement `reminderLogRepository` methods:**
  - `insertLogStmt(db, row)`: `INSERT OR IGNORE INTO reminder_log ...`
  - `insertJobIfNewStmt(db, job)`: `INSERT INTO outbox_jobs ... SELECT ... WHERE changes() = 1`
  - `findCandidateTasks(db, todayStr, limit)`: Anti-join query ordering by `due_date ASC`
  - `findByKey(db, taskId, userId, kind, dueDate)`: PK lookup
- [ ] **Step 2: Export `reminderLogRepository` from `@pm/db`**
- [ ] **Step 3: Add unit tests in `packages/db/test/reminderLogRepository.test.ts`**
- [ ] **Step 4: Verify with `pnpm test` in `packages/db`**

---

### Task 3: Implement `reminder.service.ts` & Wire Worker Scheduled Handler (`@pm/web`)

**Files:**
- Create: `apps/web/app/services/reminder.service.ts`
- Modify: `apps/web/worker/index.ts`

- [ ] **Step 1: Create `apps/web/app/services/reminder.service.ts` with `runDeadlineScan(env, now)`**
  - Resolves candidates using `reminderLogRepository.findCandidateTasks`.
  - For each candidate, determines `OVERDUE` vs `DUE_SOON`.
  - Batches `insertLogStmt` and `insertJobIfNewStmt` (catalog A27).
  - Returns `ScanResult`.
- [ ] **Step 2: Connect `runDeadlineScan(env, now)` in `apps/web/worker/index.ts` hourly scheduled branch**
- [ ] **Step 3: Verify with `pnpm typecheck`**

---

### Task 4: Implement `handleDeadlineEmail` & `ConsoleEmailSender` in Outbox Service (`@pm/web`)

**Files:**
- Modify: `apps/web/app/services/outbox.service.ts`

- [ ] **Step 1: Extend `ConsoleEmailSender` with `sendDeadlineReminder`**
- [ ] **Step 2: Implement `handleDeadlineEmail` handler in `outbox.service.ts`**
  - Parse payload with `EmailDeadlineReminderPayloadSchema`.
  - Check task exists, not deleted, category != `DONE`.
  - Check recipient user exists, not deleted, active, has email.
  - Check user is still assigned.
  - Render subject: `[Reminder] Task due soon: <title>` or `[Overdue] Task is overdue: <title>`.
  - Call `ConsoleEmailSender.sendDeadlineReminder`.
  - Log structured info with `ctx.logger.info("Email sent (console)", ...)`.
  - Return `DONE`.
- [ ] **Step 3: Register `handleDeadlineEmail` in `jobHandlers.EMAIL_DEADLINE_REMINDER`**

---

### Task 5: Integration Tests for Deadline Scan & Email Delivery (`@pm/web`)

**Files:**
- Create: `apps/web/test/outbox/deadlineScan.test.ts`

- [ ] **Step 1: Test due soon task enqueues `DUE_SOON` reminder for assignees (FR-29 criterion 1)**
- [ ] **Step 2: Test overdue task enqueues `OVERDUE` reminder for assignees (FR-29 criterion 2)**
- [ ] **Step 3: Test duplicate scan in same hour is idempotent via anti-join (FR-29 criterion 3)**
- [ ] **Step 4: Test updating due date allows new reminder for new date (FR-29 criterion 3)**
- [ ] **Step 5: Test email template rendering & logger output via `ConsoleEmailSender` (FR-29 criterion 4)**
- [ ] **Step 6: Test email failure isolation: outbox job retries and business data is unaffected (FR-29 criterion 5)**
- [ ] **Step 7: Test done / deleted tasks and non-assigned / inactive users are ignored**

---

### Task 6: Quality Checks, PR & Auto-Merge

- [ ] **Step 1: Run format check `pnpm format:check`**
- [ ] **Step 2: Run linter `pnpm lint`**
- [ ] **Step 3: Run typecheck `pnpm typecheck`**
- [ ] **Step 4: Run test suite `pnpm test`**
- [ ] **Step 5: Update WBS row 1.33 in `docs/wbs.md`**
- [ ] **Step 6: Commit, push to `feature/deadline-email`, create PR into `develop`**
- [ ] **Step 7: Monitor CI checks until green and auto-merge per AGENTS.md §3.6**
