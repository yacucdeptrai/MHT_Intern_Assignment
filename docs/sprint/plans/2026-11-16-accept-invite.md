# Implementation Plan — M1-T3: Accept Invite & Outbox Core

> **Task ID**: `M1-T3`  
> **Branch**: `feature/accept-invite` (stacked on PR #10 `fix/separate-layouts`)  
> **Authoritative Specs**: [`docs/01-srs.md` FR-37](file:///D:/MHT_Intern_Assignment/docs/01-srs.md), [`docs/03-database-design.md` §2.14](file:///D:/MHT_Intern_Assignment/docs/03-database-design.md), [`docs/04-data-access-and-atomicity.md` A7 & A8](file:///D:/MHT_Intern_Assignment/docs/04-data-access-and-atomicity.md), [`docs/07-background-jobs-and-integrations.md` §1–§3](file:///D:/MHT_Intern_Assignment/docs/07-background-jobs-and-integrations.md)  
> **Standards**: [`AGENTS.md`](file:///D:/MHT_Intern_Assignment/AGENTS.md)

---

## 1. Goal & Requirements
1. **Outbox System**:
   - `outbox_jobs` table storing background integration tasks (`EMAIL_INVITE`, `EMAIL_DEADLINE_REMINDER`, `SLACK_POST_TASK`, `SLACK_UPDATE_THREAD`).
   - Transactional outbox pattern: side effects are committed in the same atomic `db.batch([...])` as business changes.
   - Core outbox functions: claim, execute with idempotency, finish (`DONE`), fail with exponential backoff (`FAILED`), dead-letter after 5 attempts (`DEAD`), or skip (`SKIPPED`).
   - `dispatchOutbox(ctx, jobIds)` for immediate asynchronous delivery via `ctx.waitUntil`.
   - `sweepOutbox(env, now)` for scheduled recovery of stuck jobs (>10m) and sweeping due jobs.
   - `EMAIL_INVITE` handler unseals token, builds `/invite/:token` link, and calls `ConsoleEmailSender`.
2. **Accept Invite Flow (`/invite/:token`)**:
   - Open link: validates SHA-256 token hash against `invites` table.
   - If token is unknown, expired (>7 days), or already consumed (`accepted_at IS NOT NULL`): displays "This invite is invalid or has expired" with no form.
   - If token is valid: presents set-password form.
   - Submit password (≥10 chars, confirmed):
     - Executes atomic batch A8:
       - Update `invites.accepted_at = now` (guarded by `conflictGuardStmt` to prevent double acceptance).
       - Activate/update `users` with password hash and iterations.
       - If invite carries `project_id` and `project_role`, insert into `project_members`.
     - Signs the user in with session cookie and redirects home.

---

## 2. Layered Implementation Steps

### Layer 1: Domain (`packages/domain`)
- Add `OutboxJobType` and `OutboxJobStatus` enums and constants (`OUTBOX_MAX_ATTEMPTS = 5`, `OUTBOX_BACKOFF_BASE_MS = 60000`, `OUTBOX_SWEEP_LIMIT = 20`).
- Add Zod schemas:
  - `AcceptInviteSchema`: password min 10, confirmPassword match.
  - `EmailInvitePayloadSchema`: `{ inviteId: string; sealedToken: string }`.
- Export common job and invite types.

### Layer 2: Database & Repositories (`packages/db`)
- `packages/db/src/schema/outboxJobs.ts`:
  - `outbox_jobs` table with CHECK constraints on `type` and `status`, index on `(status, next_attempt_at)`.
- Migration `0003_outbox_jobs.sql`.
- `outboxJob.repository.ts`:
  - `insertStmt(db, job)`
  - `claimStmt(db, id, now)`
  - `finishStmt(db, id, status, now, payload?)`
  - `failStmt(db, id, nextAttemptAt, attempts, errorMsg, now)`
  - `recoverStuckStmt(db, threshold, now)`
  - `listDue(db, now, limit)`
  - `findById(db, id)`
- `invite.repository.ts`:
  - `acceptStmt(db, id, now)`: conditional update `WHERE id = :id AND accepted_at IS NULL AND expires_at > :now`.

### Layer 3: Services & Outbox Core (`apps/web/app/services`)
- `crypto.server.ts`:
  - `sealInviteToken(token, secret)` and `unsealInviteToken(sealed, secret)` using AES-GCM with PBKDF2/HKDF key derivation.
- `outbox.service.ts`:
  - `dispatchOutbox`, `sweepOutbox`, `jobHandlers`.
  - `ConsoleEmailSender`.
- `invite.service.ts`:
  - `createInvite` (A7): atomic batch with `invites` + `outbox_jobs`.
  - `validateToken`: checks status, expiration, and acceptance.
  - `acceptInvite` (A8): atomic batch with version guard and password hashing.

### Layer 4: Routes & Worker (`apps/web`)
- `apps/web/app/routes/invite.$token.tsx`:
  - Loader: calls `inviteService.validateToken`.
  - Action: parses `AcceptInviteSchema`, calls `inviteService.acceptInvite`, logs user in with session cookie.
- `apps/web/worker/index.ts`:
  - In `scheduled(...)`: calls `sweepOutbox`.

### Layer 5: Testing & Verification
- Unit & integration tests for:
  - Token sealing / unsealing.
  - Outbox claim, retry, backoff, dead-letter, and stuck recovery.
  - A7 and A8 atomicity tests, including double acceptance prevention.
  - FR-37 acceptance criteria 1–4.
- E2E test in `apps/web/e2e/invite.spec.ts`:
  - Admin creates user -> copies invite token -> opens invite page -> enters password -> lands on dashboard signed in.
  - Re-opening consumed invite link shows "This invite is invalid or has expired".
