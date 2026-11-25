# Risks and Assumptions

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [Architecture §5](./02-architecture.md#5-runtime-notes) · [Dev environment §7](./08-dev-environment-and-deployment.md#7-plan-limits-and-upgrade-triggers) · [Implementation roadmap](./10-implementation-roadmap.md)

---

The Cloudflare Free plan facts below were checked against Cloudflare's documentation on 2026-11-16. Re-check them when a verification task runs.

The owner of every item is **Hoàng Anh** (PIC). Update the **Status** column when the verification task completes, and record the outcome in the Notes.

## 1. Risks

| # | Risk | Impact | Verification | Fallback | Status |
| :-- | :--- | :--- | :--- | :--- | :--- |
| R1 | **Workers Free plan allows 10 ms CPU per request.** PBKDF2 password hashing, SSR of large Ant Design pages, and Excel generation (SheetJS) for big exports can exceed it (error 1102). | Login, heavy pages, or export may fail in deployed environments. Local development is unaffected. | M0-T5: measure the hash time in a deployed dev Worker. M8-T6: measure export CPU for 500 tasks on deployed dev Worker across 5+ runs using Cloudflare Workers Logs. Watch Workers Logs for `exceededCpu`. | If deployed CPU exceeds 10 ms on Free, stop and report to author. Workers Paid is NOT the fallback. | **Decision (2026-11-19, M8-T6):** Stay on Workers Free; .xlsx is built in the browser. The server returns raw sanitized rows (`format=rows`) or CSV (`format=csv`), keeping CPU cost minimal on Workers. Functional scaling verified for 500 tasks in `apps/web/test/export/exportBenchmark.test.ts`. **Measured on deployed dev (2026-11-19, pm-dev, 500 tasks with assignees, `cpuTime` from `wrangler tail --env dev --format json`, matched by `cf-ray`, warm-up excluded):** `format=csv` n=12: min 12, median 13.5, max 21 ms CPU. `format=rows` n=13: min 10, median 12, max 34 ms CPU. All 32 captured invocations ended `outcome: ok`; none reported `exceededCpu` and no request returned 1102. For comparison on the same run: `POST /login` (PBKDF2, 100,000 iterations) 35–54 ms CPU and the 5-minute cron tick 14 ms CPU, also `ok`. Both export formats are above the nominal 10 ms but are not being cut off; the per-request cost is dominated by the framework and D1 row decoding, not by the export format. Seed data was removed after the measurement. **Decision (2026-11-19, author): Option A, accept and monitor.** Stay on Workers Free; keep PBKDF2 at 100,000 iterations; no per-request CPU optimization work for now. Monitor Workers Logs for `exceededCpu` and 1102 responses on pm-dev (login is the earliest signal); revisit if any appear. **i18n check (2026-11-20, after M9-T1, pm-dev, anonymous `GET /login`, `cpuTime` from `wrangler tail`, matched by `cf-ray`, warm-up excluded):** Vietnamese (default, no cookie) n=8: min 5, median 6, max 9 ms; English (`lang=en`) n=8: min 3, median 5.5, max 10 ms; `GET /api/health` n=6: median 2.5 ms. All 24 invocations `ok`, no `exceededCpu`; SSR `<html lang>` was `vi` and `en` respectively. No pre-i18n `GET /login` baseline exists, but the page renders well inside the 10 ms budget, so i18next (one isolate instance, cloned per request) adds no measurable risk. |
| R2 | The Free plan allows 50 D1 queries and 50 subrequests per invocation. A batch counts as one query. | Chatty loaders or a large cron sweep could fail. | Integration tests count queries for the heaviest loaders (task detail, dashboard). | Batch reads ([Data access §6](./04-data-access-and-atomicity.md#6-reads-and-the-query-budget)); sweep at most 20 jobs per tick. | Mitigated by design |
| R3 | The Free plan allows 5 Cron Triggers per account. | Three environments with two schedules each would exceed it. | n/a | One `*/5 * * * *` trigger per environment, with an hourly branch inside it ([Background jobs §2](./07-background-jobs-and-integrations.md#2-scheduled-handler)). | Mitigated by design |
| R4 | The Free plan allows 500 MB per D1 database and 10 databases per account. | Ample for a mock. | n/a | Three remote databases plus local. | Accepted |
| R5 | **The version guard and batch atomicity.** The design depends on two things: D1 rolling back a whole batch on any error (documented by Cloudflare), and `changes()` inside a Drizzle D1 batch referring to the preceding statement (not yet verified). | This is the core data-integrity pattern. If it is wrong, conflicting edits could commit partial side effects. | M0-T3: the four proofs in [Data access §3.1](./04-data-access-and-atomicity.md#31-the-version-guard), as automated tests. Pin the `drizzle-orm` and `drizzle-kit` versions. | A post-state assertion, `assertRowStmt`: `INSERT INTO batch_guard (ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM <table> WHERE id = ? AND <column> = <expected value>)`. Later statements in a D1 batch see earlier writes, so it does not depend on `changes()`. A trigger would not work, because a 0-row update fires no row triggers. Only `packages/db/src/batch.ts` changes ([Data access §3.1](./04-data-access-and-atomicity.md#31-the-version-guard)). | **Proven 2026-11-16 (M0-T3):** packages/db/test/batch.test.ts shows all four points on local D1 with drizzle-orm 0.45 / drizzle-kit 0.31. The fallback is not needed. |
| R6 | Activating R2 may require a payment method on file, even within the free allowance (not verified). | Could block attachments and avatars on deployed environments. | M0-T4: create the `pm-dev` bucket. | Keep the `FileStorage` interface, and use a `D1BlobFileStorage` that stores files of 1 MB or less as BLOBs in a `file_blobs` table for the mock. Lower `MAX_ATTACHMENT_BYTES` accordingly. | **Closed 2026-11-16:** R2 is enabled on the account; buckets pm-dev, pm-staging, pm-production exist. The fallback is not needed. |
| R7 | Cloudflare's `send_email` binding needs a domain on Email Routing, and no domain is owned. | No real email delivery. | n/a | `ConsoleEmailSender` by default; a provider can be added later ([Background jobs §5.2](./07-background-jobs-and-integrations.md#52-email)). FR-29 is met in mock form. | Accepted |
| R8 | SSO redirect URIs must match each environment's `*.workers.dev` host. | Each environment needs its own OAuth app registration. | M1-T7: register local and dev first. | SSO buttons are hidden wherever credentials are missing. | Open |
| R9 | Remix v2 is in maintenance mode, and `create-remix` refuses new projects. | Long-term maintenance. | Found in M0-T1 (2026-11-16). | **Resolved:** the author chose React Router (v8.5, the current release) with `@cloudflare/vite-plugin`, which also runs the dev server in workerd. Docs and `AGENTS.md` updated. | Closed |

## 2. Assumptions

| # | Assumption | Consequence | Status |
| :-- | :--- | :--- | :--- |
| A1 | A project TEAM_LEAD, PM, or Admin can reopen a `DONE` task to the default `IN_PROGRESS` status, with a reason (decision P7). | `canReopenTask`, catalog A19, and FR-23 criterion 3. | **Accepted by the author** (2026-11-16) |
| A2 | An approver may approve a task they are assigned to; the source does not forbid it. | FR-22 criterion 4. | Open: confirm with the PM |

## 3. Limitations (accepted for v1)

- **Email** is logged, not delivered, until a provider is configured.
- **Slack** posts only when `SLACK_BOT_TOKEN` and a project channel are configured; otherwise its jobs end `SKIPPED`.
- **Delivery is at least once.** A Slack message can be duplicated in the rare case where the Worker dies between Slack's response and the database update ([Background jobs §3](./07-background-jobs-and-integrations.md#3-idempotency)).
- **Dead jobs** (`DEAD`) are visible only in logs; there is no re-queue UI.
- **Email templates** are English only.
- **No custom domain:** environments use `*.workers.dev` URLs.
