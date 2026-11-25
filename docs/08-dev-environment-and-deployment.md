# Dev Environment and Deployment

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [Architecture](./02-architecture.md) · [Database design](./03-database-design.md) · [Background jobs](./07-background-jobs-and-integrations.md) · [Testing strategy](./09-testing-strategy.md) · [Git flow](./guides/git-flow.md)

---

## 1. Prerequisites

| Tool | Version | Why |
| :--- | :--- | :--- |
| Node.js | 22 LTS or newer | Runtime for tooling (Wrangler, Vite, Vitest) |
| pnpm | 9 or newer (`corepack enable`) | Workspaces |
| Git | any recent version | Git flow ([guide](./guides/git-flow.md)) |
| Playwright browsers | installed by `pnpm exec playwright install chromium` | E2E tests |
| Cloudflare account | Free plan | **Only for deploying.** Not needed for development or tests. |

VS Code extensions: ESLint, Prettier (format on save), Code Spell Checker, and Tailwind CSS IntelliSense ([Coding conventions](./guides/coding-conventions.md)).

## 2. First-Time Setup

```bash
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars   # fill SESSION_SECRET and the admin seed values
pnpm db:migrate:local                              # create the local D1 schema
pnpm db:seed:local                                 # statuses, admin, demo project
pnpm dev                                           # http://localhost:5173
```

Everything runs locally: Wrangler's local mode simulates D1, R2, and Durable Objects on disk under `apps/web/.wrangler/state`. Delete that folder for a clean slate, then re-run the migrate and seed commands.

## 3. Command Reference

Run from the repository root.

| Command | Runs | Use |
| :--- | :--- | :--- |
| `pnpm dev` | `react-router dev`: Vite with `@cloudflare/vite-plugin`, running the Worker in workerd with local D1, R2, and Durable Object bindings, port 5173 | Daily development, including realtime |
| `pnpm build` | `react-router build` for `@pm/web` | CI, pre-deploy |
| `pnpm preview` | `react-router build && vite preview` (port 4173): the production bundle in workerd, using the same local state | Running the production bundle locally; used by E2E. Cron ticks are triggered with `curl "http://localhost:4173/cdn-cgi/handler/scheduled"` |
| `pnpm lint` | `eslint . --max-warnings 0` | Zero errors, zero warnings |
| `pnpm format` / `pnpm format:check` | `prettier --write .` / `prettier --check .` | |
| `pnpm typecheck` | `wrangler types` (refreshes `Env`), then `tsc -b` across packages | |
| `pnpm spell` | `cspell "**/*.{ts,tsx,md,json}"` | Spelling (review lessons #1, #2, #10, #11) |
| `pnpm deps:check` | `madge --circular --extensions ts packages apps/web/app` | Dependency-cycle check |
| `pnpm test` | `vitest run` in every package (domain: Node; db and web: `@cloudflare/vitest-plugin`) | Unit and integration tests |
| `pnpm test:coverage` | `vitest run --coverage` | Coverage gate ([Testing §1](./09-testing-strategy.md#1-test-pyramid)) |
| `pnpm test:e2e` | `pnpm build && playwright test` against `pnpm preview` with a freshly seeded local D1 | E2E journeys |
| `pnpm db:generate` | `drizzle-kit generate` in `@pm/db` | New migration from schema changes |
| `pnpm db:migrate:local` | `wrangler d1 migrations apply DB --local` | |
| `pnpm db:seed:local` | `tsx packages/db/seed/seed.ts --local` | |
| `pnpm db:reset:local` | removes the local D1 state, then migrates and seeds | |
| `pnpm deploy:dev` / `deploy:staging` / `deploy:production` | `CLOUDFLARE_ENV=<env> react-router build`, then `wrangler d1 migrations apply DB --remote --config wrangler.jsonc --env <env>`, then `wrangler deploy` (which ships the generated `build/server/wrangler.json`) | Normally run by CI only |

## 4. Configuration and Secrets

### 4.1 `wrangler.jsonc` (sketch)

```jsonc
// apps/web/wrangler.jsonc
{
  "name": "pm-local",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./build/client" },
  "d1_databases": [{ "binding": "DB", "database_name": "pm-local", "database_id": "local", "migrations_dir": "../../packages/db/migrations" }],
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "pm-local" }],
  "durable_objects": { "bindings": [{ "name": "NOTIFICATION_HUB", "class_name": "UserNotificationHub" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserNotificationHub"] }],
  "triggers": { "crons": ["*/5 * * * *"] },
  "vars": { "APP_ENV": "local", "APP_BASE_URL": "http://localhost:5173", "EMAIL_PROVIDER": "console" },
  "env": {
    "dev": {
      "name": "pm-dev",
      "d1_databases": [{ "binding": "DB", "database_name": "pm-dev", "database_id": "<from wrangler d1 create>", "migrations_dir": "../../packages/db/migrations" }],
      "r2_buckets": [{ "binding": "FILES", "bucket_name": "pm-dev" }],
      "durable_objects": { "bindings": [{ "name": "NOTIFICATION_HUB", "class_name": "UserNotificationHub" }] },
      "triggers": { "crons": ["*/5 * * * *"] },
      "vars": { "APP_ENV": "dev", "APP_BASE_URL": "https://pm-dev.<account-subdomain>.workers.dev", "EMAIL_PROVIDER": "console" }
    }
    // "staging" and "production" repeat the "dev" block with pm-staging / pm-production names
  }
}
```

Bindings and vars are **not inherited** by Wrangler environments, so each `env` block repeats them in full. `pnpm typecheck` runs `wrangler types`, which regenerates the `Env` interface from this file.

| Binding | Type | Used by |
| :--- | :--- | :--- |
| `DB` | D1 | `@pm/db` through `drizzle(env.DB)` |
| `FILES` | R2 | `R2FileStorage` |
| `NOTIFICATION_HUB` | Durable Object namespace (`UserNotificationHub`, SQLite-backed) | Realtime ([Background jobs §4](./07-background-jobs-and-integrations.md#4-realtime-notifications)) |

### 4.2 Variables and secrets

Local values live in `apps/web/.dev.vars` (git-ignored). `apps/web/.dev.vars.example` lists every key with a placeholder. **Adding a key means adding it to the example file and to the table below** (pre-push checklist item 5).

| Key | Kind | Required | Notes |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | var | ✅ | `local`, `dev`, `staging`, `production` |
| `APP_BASE_URL` | var | ✅ | Used in Slack and email links; the default `*.workers.dev` URL when deployed |
| `EMAIL_PROVIDER` | var | ✅ | `console` |
| `SESSION_SECRET` | secret | ✅ | At least 32 random bytes, base64; signs the session cookie |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | secret | ✅ | First Admin account |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret | ✅ | Google SSO is hidden when missing |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | secret | ✅ | Microsoft SSO is hidden when missing |
| `SLACK_BOT_TOKEN` | secret | ✅ | Slack jobs end `SKIPPED` when missing |

Remote secrets are set with `wrangler secret put <KEY> --env <env>`. They are never committed and never placed in `vars`.

## 5. Cloudflare Resources

Create these once per environment (`dev`, `staging`, `production`), then paste the D1 `database_id` into `wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler d1 create pm-dev
npx wrangler r2 bucket create pm-dev
# repeat with pm-staging and pm-production
npx wrangler secret put SESSION_SECRET --env dev
```

Durable Object namespaces and cron triggers are created by the first `wrangler deploy`. The Worker is reachable at `https://pm-<env>.<account-subdomain>.workers.dev`. **No custom domain is needed.**

R2 may require a payment method on file before the first bucket can be created, even within the free allowance. This is risk R6, and roadmap task M0-T4 checks it ([Risks](./11-risks-and-assumptions.md)).

## 6. CI/CD (GitHub Actions)

### 6.1 `ci.yml`: every pull request

```yaml
name: ci
on: { pull_request: { branches: [develop, staging, main] } }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check && pnpm lint && pnpm typecheck && pnpm spell && pnpm deps:check
      - run: pnpm test:coverage
      - run: pnpm build
      - run: pnpm --filter @pm/web exec playwright install --with-deps chromium && pnpm test:e2e
```

A PR merges only when `check` is green ([PR review rules](./guides/pr-review-rules.md)).

### 6.2 `deploy.yml`: branch pushes

| Branch | Environment | Trigger |
| :--- | :--- | :--- |
| `develop` | dev | Push (a merged PR from a `feature/*` or `fix/*` branch) |
| `staging` | staging | Push (a merged PR from `develop` after internal QA) |
| `main` | production | Push (a merged PR from `staging` after client acceptance) |

Steps, using GitHub Environments `dev`, `staging`, and `production`, each holding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:
1. Checkout, install, build (as in CI).
2. **Migrate:** `wrangler d1 migrations apply DB --env <env> --remote`.
3. **Deploy:** `wrangler deploy`. `@cloudflare/vite-plugin` selects the environment at **build** time (`CLOUDFLARE_ENV=<env> pnpm build` in step 1), and `wrangler deploy` ships the generated `build/server/wrangler.json`. Never pass `--env` to `wrangler deploy` here. The whole job runs only when the repository variable `DEPLOY_ENABLED` is `true`.
4. **Smoke check:** `curl --fail https://pm-<env>.<account-subdomain>.workers.dev/api/health` must return `{"ok":true}`.

Migrations run *before* the new code. Because they are forward-only and additive ([Database §6](./03-database-design.md#6-migrations)), the previous Worker version keeps working against the migrated schema.

### 6.3 Rollback

- **Code:** `wrangler rollback --env <env>`, or `wrangler versions list` and then `wrangler rollback <version-id>`. This restores the previous Worker version in seconds.
- **Data:** never roll back a migration. Fix forward with a new migration. In an emergency, D1 Time Travel restores a database to an earlier point (7 days on Free): `wrangler d1 time-travel restore pm-<env> --timestamp <iso>`. This also discards later writes, so it needs PM approval.

## 7. Plan Limits and Upgrade Triggers

| Limit (Free plan, checked 2026-11-16) | Where it bites | Upgrade trigger |
| :--- | :--- | :--- |
| 10 ms CPU per request | PBKDF2 at a strong iteration count; large SSR pages; Excel export (R1) | Error 1102 in Workers Logs on login or export, or a measured hash time above 10 ms at the minimum acceptable iterations → move **that environment** to Workers Paid ($5/month; accepted by the author) and raise `PBKDF2_DEFAULT_ITERATIONS` |
| 50 D1 queries and 50 subrequests per invocation | Chatty loaders; large sweeps (R2) | Fix the code first (batch reads, smaller sweep limit) |
| 5 cron triggers per account | Three environments (R3) | One trigger per environment, already designed in |
| D1: 500 MB per database, 10 databases | Data growth (R4) | Not expected for a mock |
| 100,000 requests per day | Load tests | Not expected |
| R2 activation may need a payment method (R6) | First bucket | Decide in M0 ([Risks](./11-risks-and-assumptions.md)) |
| SSO redirect URIs per `workers.dev` host (R8) | Each environment needs its own OAuth registration | n/a |
