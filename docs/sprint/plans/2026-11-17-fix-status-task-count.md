# Fix Status Task Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggregate actual taskCount per status (including archived tasks) on the admin statuses page.

**Architecture:** Add `countGroupedByStatusId` to `taskRepository` (`GROUP BY status_id`), expose via `taskStatusService.getTaskCountsByStatus`, integrate into `adminStatusesLoader`, and update `taskStatusRepository.deleteStmt` to use `notExists` sub-query.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Vitest

**Spec:** docs/01-srs.md (FR-20 c3)

---

### Task 1: Add grouped count by status and loader aggregation

**Files:**
- Modify: `packages/db/src/repositories/task.repository.ts`
- Modify: `packages/db/src/repositories/taskStatus.repository.ts`
- Modify: `apps/web/app/services/taskStatus.service.ts`
- Modify: `apps/web/app/loaders/adminStatusesLoader.ts`
- Test: `apps/web/test/status/adminStatusesAction.test.ts`

- [ ] **Step 1: Write the failing test** in `apps/web/test/status/adminStatusesAction.test.ts`: verify that a status with 2 tasks (one active, one archived) shows `taskCount: 2`, and a status with no tasks shows `taskCount: 0`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `taskRepository.countGroupedByStatusId`, expose on `taskStatusService`, and consume in `adminStatusesLoader`**
- [ ] **Step 4: Update `taskStatusRepository.deleteStmt` with `notExists` and remove TODO(M3-T2)**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Run verification suite (`vitest`, `build`, `e2e`)**
- [ ] **Step 7: Commit, push, open PR, watch CI, auto-merge**
