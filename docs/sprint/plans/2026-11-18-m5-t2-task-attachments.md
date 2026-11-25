# Task Attachments (M5-T2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement task attachment upload, download, and delete (FR-18, A23, A24) with Cloudflare R2 object storage, byte-signature validation, strict 10 MB limits, and non-member 404 visibility guards.

**Architecture:** A forward-only migration introduces the `attachments` table in D1 SQLite with strict CHECK constraints and indexes. `@pm/domain` provides file validation, schemas, and RBAC policies. `@pm/db` provides the `attachmentRepository`. `attachmentService` enforces the A23/A24 atomic batch patterns and R2 write order (put before batch with cleanup in catch; delete after commit via `waitUntil`). Resource routes handle multipart upload and streaming download with nosniff headers.

**Tech Stack:** React Router v8, Cloudflare Workers & R2, Drizzle ORM on D1 (SQLite), Zod, Vitest, Playwright.

**Spec:** `docs/01-srs.md` (FR-18), `docs/03-database-design.md` (§attachments), `docs/04-data-access-and-atomicity.md` (A23, A24, §5), `docs/05-rbac-and-workflow.md` (§3.2, §5.1), `docs/06-routes-and-actions.md` (§3.5, §3.6).

---

## Global Constraints

- Max attachment size: exactly `10,485,760` bytes (`MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024`).
- Exactly `10,485,760` bytes must be accepted; `10,485,761` bytes must be rejected with 400 `"File is larger than 10 MB"` and nothing stored.
- Size check must check actual file bytes, never trust `Content-Length` alone.
- Disguised files (e.g. HTML or executable disguised as PNG or PDF) must be detected and rejected.
- R2 upload: put object in R2 *before* DB batch; delete object in `catch` if batch fails; add `// TODO(M7-T5): orphan sweep will clean up leftovers if worker dies`.
- R2 delete: DB delete + `conflictGuardStmt` + audit inside batch; R2 delete *after* commit via `ctx.waitUntil(...)`.
- Non-members requesting download or upload get 404 `"Project not found"`. No public bucket URL.
- Download route headers: `Content-Disposition: attachment; filename="${safeName}"`, `Content-Type: ${contentType}`, `X-Content-Type-Options: nosniff`.
- Archived project mutations return 403 `"This project is archived"`.
- Clean Git Identity: zero AI names, zero `Co-authored-by:` trailers in commits or PRs.

---

## Review Focus

1. **Exact 10 MB Boundary**: Test `10,485,760` bytes (accepted) vs `10,485,761` bytes (rejected with 400 `"File is larger than 10 MB"` and no R2 put).
2. **Disguised MIME Spoofing**: Test file with HTML content `<html>` declared as `image/png` or `application/pdf` is rejected with 400.
3. **Write Order & Rollback on Batch Failure**: Test simulated batch failure deletes the newly uploaded R2 object in `catch`.
4. **Delete Order & Concurrency**: Test double-delete returns 409 conflict, and R2 delete is only dispatched after commit.
5. **Non-member Download Guard**: Test non-member GET `/api/attachments/:attachmentId` returns 404 and does not fetch or leak R2 data.

---

## Task 1: Domain File Validation, Types, Schemas & Policies

**Files:**
- Modify: `packages/domain/src/constants.ts`
- Modify: `packages/domain/src/files.ts`
- Create: `packages/domain/src/schemas/attachment.ts`
- Create: `packages/domain/src/types/attachment.ts`
- Modify: `packages/domain/src/policies/project.ts`
- Modify: `packages/domain/src/types/task.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/test/attachment.schema.test.ts`
- Create: `packages/domain/test/files.test.ts`

- [ ] **Step 1.1**: Define `ALLOWED_ATTACHMENT_MIME_TYPES` in `packages/domain/src/constants.ts` (images, PDF, text, zip, office documents).
- [ ] **Step 1.2**: In `packages/domain/src/files.ts`, implement `validateAttachmentContentType(bytes: Uint8Array, declaredMimeType: string): string | null` and `sanitizeFileName(name: string): string` (1..255 chars, stripping traversal/control chars).
- [ ] **Step 1.3**: Create `packages/domain/src/schemas/attachment.ts` with `AttachmentIdSchema` and `AttachmentUploadSchema`.
- [ ] **Step 1.4**: Create `packages/domain/src/types/attachment.ts` with `AttachmentDto` and `AttachmentUploadInput`. Update `TaskPermissions` with `canAttach: boolean` and `TaskDetailLoaderData` with `attachments: AttachmentDto[]`.
- [ ] **Step 1.5**: In `packages/domain/src/policies/project.ts`, implement `canUploadAttachment(actor)` and `canDeleteAttachment(actor, attachment)`.
- [ ] **Step 1.6**: Export new symbols from `packages/domain/src/index.ts`.
- [ ] **Step 1.7**: Write unit tests for file type detection, disguised files, filename sanitization, attachment schemas, and policies.
- [ ] **Step 1.8**: Run vitest on packages/domain and verify 100% pass.

---

## Task 2: Database Schema, Migration & Repository

**Files:**
- Create: `packages/db/src/schema/attachments.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/migrations/0010_attachments.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Create: `packages/db/src/repositories/attachment.repository.ts`
- Create: `packages/db/test/attachmentRepository.test.ts`

- [ ] **Step 2.1**: Define Drizzle table `attachments` matching `docs/03-database-design.md` (CHECK `size_bytes BETWEEN 1 AND 10485760`, CHECK `length(file_name) BETWEEN 1 AND 255`, UNIQUE `storage_key`, index `idx_attachments_task` on `(task_id)`).
- [ ] **Step 2.2**: Export table from schema index.
- [ ] **Step 2.3**: Write migration `0010_attachments.sql` and update `_journal.json`.
- [ ] **Step 2.4**: Implement `packages/db/src/repositories/attachment.repository.ts`:
  - `insertStmt(db, attachment)`
  - `deleteStmt(db, id)`
  - `findById(db, id)`
  - `listByTaskIdWithUploader(db, taskId)`
- [ ] **Step 2.5**: Write integration tests in `packages/db/test/attachmentRepository.test.ts` checking constraints, unique storage key, index plan, and repository methods.
- [ ] **Step 2.6**: Run vitest on packages/db and verify 100% pass.

---

## Task 3: Attachment Service & Task Loader Integration

**Files:**
- Create: `apps/web/app/services/attachment.service.ts`
- Modify: `apps/web/app/services/task.service.ts`
- Create: `apps/web/test/attachment/attachment.service.test.ts`

- [ ] **Step 3.1**: Implement `attachmentService.uploadAttachment`:
  - Verify access (`loadProjectAccess`, 404 for non-members, 403 if project archived).
  - Verify file size: `1..10,485,760` bytes. If > 10,485,760, throw `ValidationError("File is larger than 10 MB")`.
  - Validate byte signature via `validateAttachmentContentType`. Reject disguised files with 400.
  - Sanitize filename.
  - Generate UUID `attachmentId` and `storageKey = projects/${projectId}/tasks/${taskId}/${attachmentId}`.
  - Put into R2 storage *before* batch.
  - Execute DB batch: `attachmentRepository.insertStmt` + `auditLogRepository.insertStmt(..., "ATTACHMENT_ADDED")`.
  - Catch block: call `storage.delete(storageKey)`, log error, add `// TODO(M7-T5): orphan sweep will clean up leftovers if worker dies`, and rethrow.
  - Return `AttachmentDto`.
- [ ] **Step 3.2**: Implement `attachmentService.downloadAttachment`:
  - Verify access via `loadProjectAccess` (404 for non-members).
  - Find attachment row by ID, ensuring `attachment.taskId` belongs to `projectId` (404 otherwise).
  - Fetch R2 object via `storage.get(attachment.storageKey)`. If missing in R2, throw 404.
  - Return `{ stream: stored.body, fileName: attachment.fileName, contentType: attachment.contentType, size: attachment.sizeBytes }`.
- [ ] **Step 3.3**: Implement `attachmentService.deleteAttachment`:
  - Verify access (`loadProjectAccess`, 404 for non-members, 403 if project archived).
  - Find attachment row (404 if not found).
  - Check `canDeleteAttachment(actor, attachment)`. Throw 403 if unauthorized.
  - Atomic batch: `attachmentRepository.deleteStmt(db, attachmentId)` + `conflictGuardStmt(db)` + `auditLogRepository.insertStmt(..., "ATTACHMENT_REMOVED")`.
  - Post-commit: schedule R2 delete via `ctx.waitUntil(storage.delete(attachment.storageKey))`.
- [ ] **Step 3.4**: Integrate with `taskService.getTaskDetails` to load attachments with uploader names and computed `canDelete`.
- [ ] **Step 3.5**: Write unit and integration tests in `apps/web/test/attachment/attachment.service.test.ts` covering all FR-18 criteria and boundary conditions.
- [ ] **Step 3.6**: Run vitest on attachment service tests and verify 100% pass.

---

## Task 4: Resource Routes, Task Detail Action, UI & E2E

**Files:**
- Create: `apps/web/app/routes/api.attachments.upload.ts`
- Create: `apps/web/app/routes/api.attachments.$attachmentId.ts`
- Modify: `apps/web/app/actions/taskDetailAction.ts` (resolve `TODO(M5-T2)`)
- Create: `apps/web/app/components/task/TaskAttachmentsSection.tsx`
- Modify: `apps/web/app/routes/_app.projects.$projectId.tasks.$taskId.tsx`
- Modify: `apps/web/test/project/projectVisibilitySweep.test.ts`
- Create: `apps/web/e2e/taskAttachments.spec.ts`

- [ ] **Step 4.1**: Create `apps/web/app/routes/api.attachments.upload.ts`:
  - `POST` multipart handler extracting `projectId`, `taskId`, and `file`.
  - Verify byte size ≤ `MAX_ATTACHMENT_BYTES` before reading entire body.
  - Call `attachmentService.uploadAttachment`.
  - Return 201 with `AttachmentDto` JSON.
- [ ] **Step 4.2**: Create `apps/web/app/routes/api.attachments.$attachmentId.ts`:
  - `GET` loader looking up attachment and calling `attachmentService.downloadAttachment`.
  - Stream R2 body with headers:
    - `Content-Disposition: attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`
    - `Content-Type: ${contentType}`
    - `X-Content-Type-Options: nosniff`
    - `Content-Length: ${size}`
- [ ] **Step 4.3**: Add `/api/attachments/:attachmentId` and `/api/attachments/upload` to `apps/web/test/project/projectVisibilitySweep.test.ts` ensuring non-members receive 404.
- [ ] **Step 4.4**: In `apps/web/app/actions/taskDetailAction.ts`, resolve `TODO(M5-T2)` for `intent === "deleteAttachment"`.
- [ ] **Step 4.5**: Create `TaskAttachmentsSection.tsx` and render in `_app.projects.$projectId.tasks.$taskId.tsx` with upload button, attachment cards, download links, and delete triggers.
- [ ] **Step 4.6**: Write comprehensive Playwright E2E tests in `apps/web/e2e/taskAttachments.spec.ts`.
- [ ] **Step 4.7**: Run all unit tests, build, and E2E specs.

---

## Task 5: Verification, PR, Merge & Final WBS / M5 Completion

- [ ] **Step 5.1**: Verify `git grep "TODO(M5-"` returns nothing.
- [ ] **Step 5.2**: Run full repo test suites (`vitest --maxWorkers=2`, `pnpm build`, `CI=1 pnpm test:e2e`).
- [ ] **Step 5.3**: Commit with clean Conventional Commit message following AGENTS.md §0.2, §0.3, §3.2.
- [ ] **Step 5.4**: Push `feature/task-attachments` through Husky pre-push.
- [ ] **Step 5.5**: Create PR into `develop`, monitor CI until green, and auto-merge per AGENTS.md §3.6.
- [ ] **Step 5.6**: Pull `develop`, verify develop CI run succeeds.
- [ ] **Step 5.7**: Update `docs/wbs.md` row `1.22` to `IN TESTING` / `80%`.
- [ ] **Step 5.8**: Output final Milestone M5 report.
