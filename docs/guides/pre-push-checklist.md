# Pre-Push and PR Checklist

> **Source:** [`nativedocs/07-pre-push-checklist.md`](../nativedocs/07-pre-push-checklist.md) (sheet `Checklist` in `Tài liệu cho intern_Hoành_Anh.xlsx`)
> **Purpose:** a self-verification checklist of **13 core items** that every developer and intern must check before pushing code to the remote and pinging a reviewer.

> **Adapted for this project:** commands use the `pnpm` scripts from [Dev environment §3](../08-dev-environment-and-deployment.md#3-command-reference). Item 5 uses `.dev.vars.example` and Wrangler secrets instead of `.env.example`. Item 10 is a D1 migration review instead of the MySQL charset check. Each adapted line is marked.

---

## The 13 Self-Check Items

| # | Item | Level | Required action |
| :---: | :--- | :---: | :--- |
| **01** | **Automatic code formatting** | Mandatory | Run the linter and formatter (`eslint`, `prettier`, `tsc --noEmit`). *Adapted:* `pnpm format:check && pnpm lint && pnpm typecheck`. |
| **02** | **Run unit tests locally** | Mandatory | 100% of the test suite passes on your machine before you push. *Adapted:* `pnpm test`. |
| **03** | **Remove `console.log`** | Mandatory | Delete every leftover debug statement. |
| **04** | **Remove dead code** | Mandatory | Delete unused code. If something is kept for the future, it needs a clear `TODO: ...` note. |
| **05** | **Update the environment example** | Mandatory | When you add an environment variable, immediately add it to the example file. *Adapted:* `apps/web/.dev.vars.example` and the secrets table in [Dev environment §4.2](../08-dev-environment-and-deployment.md#42-variables-and-secrets). |
| **06** | **Always rebase (never merge)** | Mandatory | Rebase onto the target branch (e.g. `develop`) before opening a PR. |
| **07** | **Complete i18n files** | Important | Keep translation keys in sync across every supported language. *Adapted:* `en.json` and `vi.json`. |
| **08** | **Correct English and grammar** | Important | Variable, function, and file names and comments are 100% correct English, with no spelling mistakes. *Adapted:* `pnpm spell`. |
| **09** | **Consistent validation logic** | Mandatory | Create and Edit screens validate the same way. |
| **10** | **Database migration check** | Mandatory | *Original:* new tables use charset `utf8mb4_bin`. *Adapted:* review the D1 migration (see §10 below). |
| **11** | **All CI checks pass** | Mandatory | Check CI status on GitHub: lint, Reviewdog, SonarQube must be green. *Adapted:* the `ci.yml` `check` job must be green. |
| **12** | **Follow the coding conventions** | Mandatory | Check the naming rules for files, components, actions, services, and repositories. |
| **13** | **Follow the clean architecture** | Mandatory | Check the call flow between layers (Route → Service → Repository). |

---

## Details for Each Item

### 1. Format code with the standard tools
- Before committing, run the format and lint commands:
  ```bash
  npm run lint
  npm run format # or npx prettier --write .
  ```
  *Adapted:* `pnpm format && pnpm lint && pnpm typecheck`.
- Never leave whitespace errors, messy indentation, or unused imports.

### 2. Run all unit tests locally
- If the project has unit tests, run them on your machine:
  ```bash
  npm run test # or npx vitest run
  ```
  *Adapted:* `pnpm test`, plus `pnpm test:e2e` when the change touches UI flows.
- **Only push when 100% of the test cases pass (green).**

### 3. Remove unnecessary `console.log` completely
- Before pushing, search the files you changed for `console.log`.
- If you need logging to monitor the system in Production, use the system's standard logger (`logger.info`, `logger.error`) with a specific user ID and request ID ([Architecture §4.5](../02-architecture.md#45-logging)).

### 4. Remove dead code
- Unused variables, functions, and imports must be removed completely.
- If a piece of code is preparing for a feature in a later sprint, leave a clear comment with a tag:
  ```typescript
  // TODO(hoanganh): Integrate the payment webhook in Sprint 2 per request PRJ-102
  ```

### 5. Add environment variables to the example file
- Whenever you add a new configuration key to your personal environment file (for example `SLACK_WEBHOOK_URL`, `JWT_REFRESH_SECRET`):
- You **must** add that key to the example file, with a placeholder value, so colleagues' apps do not crash when they pull the new code.

> **Adapted for this project:** local values live in `apps/web/.dev.vars` (git-ignored). Add the key with a placeholder to `apps/web/.dev.vars.example`, add a row to the secrets table in [Dev environment §4.2](../08-dev-environment-and-deployment.md#42-variables-and-secrets), and, for secrets, tell the PIC to run `wrangler secret put <KEY> --env <env>` for each environment.

### 6. Always rebase onto the target branch before creating a PR
- Example: you created `feature/task-list` from `develop`. Before opening a PR into `develop`:
  ```bash
  git checkout develop
  git pull origin develop
  git checkout feature/task-list
  git rebase develop
  ```
  > **Warning:** use **rebase**. **Never use `git merge`** from the target branch back into your feature branch. Rebasing keeps the commit history straight and clean.

### 7. Keep every i18n file complete
- If the system supports several languages (for example English, Vietnamese, Japanese):
- When you add a new translation key to `en.json`, add the matching key to `vi.json` (and `ja.json`). Otherwise users who switch language see raw keys (for example `errors.auth.userNotFound`).

> **Adapted for this project:** the supported languages are English and Vietnamese only (decision P14). The CI missing-key check fails on any gap.

### 8. Correct English and grammar
- All file names, variables, functions, code comments, and user-facing or log messages must be in English.
- Pay attention to grammar and spelling, and avoid common mistakes such as:
  - ❌ `Users does not exits` → ✅ `User does not exist`
  - ❌ `clib` → ✅ `You are not a member of this project`
  - ❌ `notificatonRepository.ts` → ✅ `notificationRepository.ts`

### 9. Keep validation consistent between Create and Edit
- This is a very common business bug:
  - *Example:* the Create User screen checks that the email is unique and matches the regex, but the Update screen skips those checks, so duplicate or invalid data reaches the database.
- **Solution:** reuse the same Zod validation schema for both Create and Update.

> **Adapted for this project:** Update schemas are derived from Create schemas (`.partial().extend(...)`), as listed in [Routes §4](../06-routes-and-actions.md#4-validation-parity). The uniqueness checks live in the service and apply to both paths.

### 10. Database migration check
- *Original (MySQL):* when creating a new migration, check that the table uses `utf8mb4_bin`:
  ```sql
  ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
  ```
  The `utf8mb4_bin` charset stores special characters and emoji correctly and compares strings case-sensitively.

> **Adapted for this project (D1 / SQLite):** SQLite stores text as UTF-8, so there is no charset to set. Instead, review each new file in `packages/db/migrations/`:
> - Every enum column has its `CHECK (… IN (…))` constraint, and every partial or composite index from [Database §4](../03-database-design.md#4-indexes) is present.
> - Case rules are explicit: `COLLATE NOCASE` only on `users.email`, `invites.email`, `projects.code`, and `task_statuses.name`.
> - The migration is **forward-only and additive**, and no migration that has already been applied was edited ([Database §6](../03-database-design.md#6-migrations)).
> - `pnpm db:migrate:local` runs cleanly on a fresh local database.

### 11. Make sure every GitHub CI check passes
- After pushing and opening the PR, watch the Checks tab on GitHub:
  - lint check
  - Reviewdog check
  - SonarQube Quality Gate
  - unit tests
- If any step is red, read the error log immediately and push a fix before pinging the reviewer.

> **Adapted for this project:** the `ci.yml` `check` job runs format, lint, typecheck, spell, dependency-cycle check, tests with coverage, build, and E2E ([Dev environment §6.1](../08-dev-environment-and-deployment.md#61-ciyml-every-pull-request)). Reviewdog and SonarQube are optional additions, not part of the current pipeline.

### 12. Re-check the coding conventions
- Check that names follow the conventions:
  - Components: `PascalCase.tsx`
  - Actions / Loaders: `camelCase.ts`
  - Repositories / Services: `camelCase.ts`
  - Boolean variables: `is...`, `has...`, `can...`
  - Constants: `UPPER_SNAKE_CASE`

  *Adapted:* see [Coding conventions](./coding-conventions.md) for the exact suffixes (`*Action.ts`, `*Loader.ts`, `*.service.ts`, `*.repository.ts`).

### 13. Check the project architecture (clean architecture)
- Make sure dependencies flow one way, from the outside in:
  ```text
  Route / UI Component ──> Action / Loader ──> Service (business logic) ──> Repository (data access) ──> Database
  ```
- Never call the database (Prisma) directly inside a UI component or route action without going through the Service / Repository layers.

> **Adapted for this project:** the database is reached only through repositories in `packages/db` (Drizzle on D1), each taking an injected `db`. Multi-row writes are atomic batches assembled in services ([Data access](../04-data-access-and-atomicity.md)). Package boundaries are enforced by lint and `pnpm deps:check` ([Architecture §2.1](../02-architecture.md#21-dependency-rule)).
