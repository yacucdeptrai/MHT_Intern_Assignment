# Threaded Task Comments Implementation Plan (FR-19 / M5-T1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one-level threaded task comments (`A21` add comment with `TASK_COMMENTED` notifications, `A22` soft delete comment with `conflictGuardStmt`) on top of the existing `comments` table from `M4-T3`, surfacing rejection/reopen root comments and rendering `"Comment deleted"` with preserved replies (`FR-19` c1–3).

**Architecture:** Add `CommentCreateSchema`, `CommentIdSchema`, `canCreateComment`, and `CommentDto`/`CommentThread` types in `@pm/domain`; extend `commentRepository` in `@pm/db` with `findByIdIncludingDeleted`, `listByTaskWithAuthor` (using `idx_comments_task`, mapping soft-deleted users to `"Deleted user"` per `FR-03` c4), and `softDeleteStmt`; implement `commentService` (`addComment` A21 and `deleteComment` A22) and attach `comments: CommentThread[]` to `taskService.getTaskDetails`; resolve `TODO(M5-T1)` in `taskDetailAction.ts` and `_app.projects.$projectId.tasks.$taskId.tsx`.

**Tech Stack:** React Router v8, Cloudflare D1, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** `docs/01-srs.md` (`FR-19`, `FR-09` c4, `FR-03` c4, `P18`), `docs/03-database-design.md` (`§comments`, `§notifications`), `docs/04-data-access-and-atomicity.md` (`A21`, `A22`, `§3.2`), `docs/05-rbac-and-workflow.md` (`§3.2`, `§5.1`), `docs/06-routes-and-actions.md` (`§3.4`, `§3.5`), `docs/09-testing-strategy.md` (`§3.3`, `§3.6`)

## Global Constraints
- Build on the existing `comments` table (`0009_comments.sql`); do not recreate or rename it.
- Non-members receive `404` on every project-scoped operation (`loadProjectAccess`); archived projects reject comment create/delete with `403 "This project is archived"` (`FR-09` c4); `DONE` tasks allow comments (`docs/05` §5.1: `canEditTask` is the only policy reading `task.category`).
- Comment `body` is trimmed to `1–5,000` characters (`FR-19` c1, `docs/09` §3.6).
- Replies re-point a reply-to-reply to the root comment (`parent.parentCommentId ?? parent.id`) so threads stay one level deep (`FR-19` c2).
- `A21` deduplicates recipients (`creator ∪ assignees \ {author}`) and handles empty recipient sets cleanly via `compactBatch`; marks `// TODO(M6-T2): publishNotifications after commit (A21 TASK_COMMENTED)`.
- `A22` soft-deletes with `conflictGuardStmt`, so deleting an already-deleted comment returns `409 ConflictError`; deleted comments withhold `body` (`null`) and render `"Comment deleted"` while replies remain visible (`FR-19` c3).

## Review Focus
- Reply-to-reply (`parentCommentId` pointing to a child comment) -> saved with `parent_comment_id = root.id` (never 2 levels deep), and `parentCommentId` belonging to another task -> rejected with `400`.
- Creator who is also an assignee when another member comments -> receives exactly 1 `TASK_COMMENTED` notification (no duplicate).
- Author who is both sole creator and sole assignee -> `A21` succeeds with 0 notification rows written.
- Second delete of an already soft-deleted comment -> hits `softDeleteStmt` + `conflictGuardStmt` and throws `409 ConflictError` (not silent `200` and not `404`).
- Rejection and reopen reasons created in `M4-T3` (`A19`) -> appear in `comments` thread on the task page alongside regular comments, and soft-deleted comment authors show `"Deleted user"` (`FR-03` c4).

---

### Task 1: Domain Schemas, Policy & `commentRepository` (`@pm/domain`, `@pm/db`)

**Files:**
- Create: `packages/domain/src/schemas/comment.ts`
- Create: `packages/domain/src/types/comment.ts`
- Modify: `packages/domain/src/policies/project.ts`
- Modify: `packages/domain/src/types/task.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/src/repositories/comment.repository.ts`
- Test: `packages/domain/test/comment.schema.test.ts`
- Modify: `packages/domain/test/project.policy.test.ts`
- Modify: `packages/db/test/commentRepository.test.ts`

**Interfaces:**
- Produces: `CommentCreateSchema`, `CommentIdSchema`, `canCreateComment(actor)`, `CommentDto`, `CommentThread`, `commentRepository.findByIdIncludingDeleted`, `commentRepository.listByTaskWithAuthor`, `commentRepository.softDeleteStmt`.

- [ ] **Step 1: Write failing domain and repository tests** (`CommentCreateSchema` 1..5000 boundary + emoji/Vietnamese, `CommentIdSchema`, `canCreateComment` / `canDeleteComment`, `commentRepository.listByTaskWithAuthor` including deleted comments + `"Deleted user"` fallback, and `softDeleteStmt` + `conflictGuardStmt` double-delete failure).
- [ ] **Step 2: Run Vitest on `@pm/domain` and `@pm/db` to confirm RED.**
- [ ] **Step 3: Implement schemas, types, policy, and repository methods.**
- [ ] **Step 4: Run Vitest on `@pm/domain` and `@pm/db` to confirm GREEN.**

### Task 2: `commentService` (`A21`, `A22`) & `taskService.getTaskDetails` Thread Loading

**Files:**
- Create: `apps/web/app/services/comment.service.ts`
- Modify: `apps/web/app/services/task.service.ts`
- Test: `apps/web/test/comment/comment.service.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas, policies, and `commentRepository`.
- Produces: `commentService.addComment(ctx, projectId, taskId, rawInput)`, `commentService.deleteComment(ctx, projectId, taskId, rawInput)`, `commentService.listThreadsForTask(ctx, actor, taskId)`, and `TaskDetailLoaderData.comments`.

- [ ] **Step 1: Write failing service tests in `apps/web/test/comment/comment.service.test.ts`** covering `FR-19` c1 (post comment 1..5000 chars, deduplicated creator+assignee notifications minus author, author-is-sole-recipient 0 notifications, forced-failure rollback), `FR-19` c2 (direct reply + reply-to-reply re-pointed to root + cross-task parent 400), `FR-19` c3 (author/PM/Admin delete, TEAM_LEAD/MEMBER non-author 403, double-delete 409 conflict, deleted root keeps replies and masks body), archived project 403, `DONE` task allowed, non-member 404, and `M4-T3` reject/reopen reasons appearing in `getTaskDetails.comments`.
- [ ] **Step 2: Run Vitest on `comment.service.test.ts` to confirm RED.**
- [ ] **Step 3: Implement `commentService` and wire `comments` + `permissions.canComment` into `taskService.getTaskDetails`.**
- [ ] **Step 4: Run Vitest on `comment.service.test.ts` and `task.service.test.ts` to confirm GREEN.**

### Task 3: `taskDetailAction` Intents, Threaded Comments UI & Playwright E2E

**Files:**
- Modify: `apps/web/app/actions/taskDetailAction.ts`
- Modify: `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`
- Modify: `apps/web/test/task/taskDetailRoute.test.ts`
- Create: `apps/web/e2e/taskComments.spec.ts`

- [ ] **Step 1: Write failing action/loader tests in `apps/web/test/task/taskDetailRoute.test.ts`** for `intent === "comment"` (201/200, 400 validation, 404 non-member) and `intent === "deleteComment"` (200, 403 non-author member, 409 double delete).
- [ ] **Step 2: Run Vitest on `taskDetailRoute.test.ts` to confirm RED.**
- [ ] **Step 3: Resolve `TODO(M5-T1)` in `taskDetailAction.ts` and render threaded comments UI in `_app.projects.$projectId.tasks.$taskId.tsx`** (root comment form, per-thread replies, reply form, delete button, `"Comment deleted"` placeholder, preserving input on 400 and resetting only on `actionData?.success === true`).
- [ ] **Step 4: Run Vitest to confirm GREEN, write `apps/web/e2e/taskComments.spec.ts` (including M4-T3 rejection reason appearing as root comment, direct reply, reply-to-reply staying flat under root, non-author cannot delete, author deletes root -> `"Comment deleted"` while replies remain), verify `git grep "TODO(M5-T1)"` returns nothing, run full verification, push, PR, and merge.**
