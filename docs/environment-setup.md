# Environment Setup: Values You Need to Provide

> **Project:** Project & Task Management System
> **Related:** [Dev environment & deployment](./08-dev-environment-and-deployment.md) · [Background jobs & integrations](./07-background-jobs-and-integrations.md)

This guide lists every value the system needs, where to obtain it, and exactly where to put it. Work through the sections in order. **Every value is required**: `apps/web/.dev.vars.example` lists each key with the section number that explains it.

| # | Section | Needed for | Required? |
| :-- | :--- | :--- | :--- |
| 1 | [Local `.dev.vars`](#1-local-devvars) | Running locally | ✅ (file created; fill every key) |
| 2 | [Cloudflare account and resources](#2-cloudflare-account-and-resources) | Deploying | ✅ before the first deploy |
| 3 | [Cloudflare API token](#3-cloudflare-api-token) | CI deploys | ✅ before the first deploy |
| 4 | [GitHub environments, secrets, variables](#4-github-environments-secrets-and-variables) | CI deploys | ✅ before the first deploy |
| 5 | [Worker secrets per environment](#5-worker-secrets-per-environment) | Deployed app | ✅ before the first deploy |
| 6 | [Google SSO](#6-google-sso) | Google sign-in | ✅ |
| 7 | [Microsoft SSO](#7-microsoft-sso) | Microsoft sign-in | ✅ |
| 8 | [Slack](#8-slack) | Slack task posts | ✅ |
| 9 | [Email provider](#9-email-provider-later) | Real email delivery | later |

**Golden rules:**
- Never commit `apps/web/.dev.vars` or any real secret. `.gitignore` already excludes them.
- Never paste secrets into issues, PRs, or chat.
- Every new key goes into `apps/web/.dev.vars.example` (with a placeholder) and the table in [Dev environment §4.2](./08-dev-environment-and-deployment.md#42-variables-and-secrets).

---

## 1. Local `.dev.vars`

`apps/web/.dev.vars` has already been created from `apps/web/.dev.vars.example`, with a random `SESSION_SECRET` and a random `ADMIN_SEED_PASSWORD`. Open it and check the following.

| Key | What to put | Notes |
| :--- | :--- | :--- |
| `APP_ENV` | `local` | Leave as is |
| `APP_BASE_URL` | `http://localhost:5173` | Leave as is |
| `EMAIL_PROVIDER` | `console` | Emails are logged to the terminal |
| `SESSION_SECRET` | already generated | To regenerate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Regenerating signs everyone out |
| `ADMIN_SEED_EMAIL` | your admin login email | Used by `pnpm db:seed:local` |
| `ADMIN_SEED_PASSWORD` | already generated | Change it if you prefer your own, at least 10 characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from §6 | Required |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | from §7 | Required |
| `SLACK_BOT_TOKEN` | from §8 | Required |

If you ever need to recreate the file:

```powershell
Copy-Item apps/web/.dev.vars.example apps/web/.dev.vars
```

Then fill `SESSION_SECRET` and `ADMIN_SEED_PASSWORD` again.

---

## 2. Cloudflare Account and Resources

You need this before the first deploy (roadmap M0-T6). The Free plan is enough to start ([Risks](./11-risks-and-assumptions.md) R1 and R6 describe when it might not be).

1. Create a free account at <https://dash.cloudflare.com/sign-up> and verify your email.
2. **Find your Account ID:** Dashboard → *Workers & Pages* → the right-hand sidebar shows **Account ID**. Copy it; it is used in §3 and §4.
3. **Choose your `workers.dev` subdomain:** *Workers & Pages* → *Overview* → set the subdomain (e.g. `your-name`). Your Workers will be at `https://pm-<env>.<subdomain>.workers.dev`.
4. **Enable R2:** *R2 Object Storage* → *Purchase R2 / Enable*. Cloudflare may ask for a payment method even though usage stays within the free allowance. Record the outcome in [Risks](./11-risks-and-assumptions.md) R6. If you do not want to add one, tell the team; the fallback in R6 applies.
5. **Create the resources from a terminal** (after `pnpm install`, once the app exists):

   ```powershell
   pnpm --filter @pm/web exec wrangler login
   pnpm --filter @pm/web exec wrangler d1 create pm-dev
   pnpm --filter @pm/web exec wrangler d1 create pm-staging
   pnpm --filter @pm/web exec wrangler d1 create pm-production
   pnpm --filter @pm/web exec wrangler r2 bucket create pm-dev
   pnpm --filter @pm/web exec wrangler r2 bucket create pm-staging
   pnpm --filter @pm/web exec wrangler r2 bucket create pm-production
   ```

6. Each `d1 create` prints a `database_id`. Paste each one into `apps/web/wrangler.jsonc`, replacing `REPLACE_WITH_PM_DEV_DATABASE_ID` (and the staging and production ones) in the matching `env.<name>.d1_databases[0].database_id`. Also replace `REPLACE_WITH_SUBDOMAIN` in each `APP_BASE_URL` with your `workers.dev` subdomain ([Dev environment §4.1](./08-dev-environment-and-deployment.md#41-wranglerjsonc-sketch)). These IDs are **not** secret and are committed.

---

## 3. Cloudflare API Token

CI uses this token to run migrations and deploy.

1. Dashboard → top-right profile → *My Profile* → *API Tokens* → **Create Token** → *Create Custom Token*.
2. **Name:** `github-actions-pm`.
3. **Permissions** (all *Account*-level):
   - `Workers Scripts` → **Edit**
   - `D1` → **Edit**
   - `Workers R2 Storage` → **Edit**
   - `Account Settings` → **Read**
4. **Account resources:** *Include* → your account.
5. Continue → **Create Token**. Copy the token now; it is shown only once.
6. Do not save it in any file. It goes straight into GitHub (§4).

---

## 4. GitHub Environments, Secrets, and Variables

Repository → *Settings* → *Environments* → **New environment**. Create three environments: `dev`, `staging`, `production`. In **each** one, add:

| Kind | Name | Value |
| :--- | :--- | :--- |
| Secret | `CLOUDFLARE_API_TOKEN` | The token from §3 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | The Account ID from §2.2 |
| Variable | `WORKER_URL` | `https://pm-dev.<subdomain>.workers.dev` (dev), `https://pm-staging.<subdomain>.workers.dev` (staging), `https://pm-production.<subdomain>.workers.dev` (production) |

**Turn deploys on:** after §2–§5 are complete, set the repository variable `DEPLOY_ENABLED` to `true` (*Settings → Secrets and variables → Actions → Variables*, or `gh variable set DEPLOY_ENABLED --body true`). Until then, `deploy.yml` skips the deploy job.

Recommended for `production`: under *Deployment protection rules*, add yourself as a **required reviewer**, so production deploys wait for a click.

From a terminal, the same can be done with the GitHub CLI (replace the values):

```powershell
foreach ($envName in 'dev','staging','production') {
  gh api -X PUT "repos/{owner}/{repo}/environments/$envName" | Out-Null
  gh secret set CLOUDFLARE_API_TOKEN  --env $envName --body '<token from §3>'
  gh secret set CLOUDFLARE_ACCOUNT_ID --env $envName --body '<account id from §2>'
  gh variable set WORKER_URL --env $envName --body "https://pm-$envName.<subdomain>.workers.dev"
}
```

> **Branch protection:** [Git flow](./guides/git-flow.md#25-security-and-permissions) requires protecting `main` and `develop`. On a **private repository on a free personal GitHub plan**, branch protection rules and rulesets are not enforced; they need GitHub Pro or a team plan. Until then, follow the rule by discipline: always merge through PRs and never push directly to `develop`, `staging`, or `main`.

---

## 5. Worker Secrets per Environment

These are the runtime secrets of the deployed Worker. Set them once per environment, after §2.

```powershell
cd apps/web
foreach ($envName in 'dev','staging','production') {
  # A different random value per environment:
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | pnpm exec wrangler secret put SESSION_SECRET --env $envName
}
```

| Secret | Where it comes from | Environments |
| :--- | :--- | :--- |
| `SESSION_SECRET` | Generated above; a different value per environment | all |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | Your choice; used once to create the first Admin | all |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | §6 | all |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | §7 | all |
| `SLACK_BOT_TOKEN` | §8 | all |

Set any one of them with `pnpm exec wrangler secret put <KEY> --env <env>`, which prompts for the value. List them with `pnpm exec wrangler secret list --env <env>`. The values themselves are never shown again.

The non-secret values (`APP_ENV`, `APP_BASE_URL`, `EMAIL_PROVIDER`) are `vars` in `wrangler.jsonc`, not secrets.

---

## 6. Google SSO

1. Open <https://console.cloud.google.com/> → create a project named `pm-sso`.
2. *APIs & Services* → *OAuth consent screen* → User type **External** → app name, support email → add yourself under *Test users*.
3. *APIs & Services* → *Credentials* → **Create credentials** → *OAuth client ID* → type **Web application**.
4. **Authorized redirect URIs:** add one per environment you use:
   - `http://localhost:5173/auth/google/callback`
   - `https://pm-dev.<subdomain>.workers.dev/auth/google/callback`
   - `https://pm-staging.<subdomain>.workers.dev/auth/google/callback`
   - `https://pm-production.<subdomain>.workers.dev/auth/google/callback`
5. Create, then copy the **Client ID** and **Client secret**.
6. Put them in `apps/web/.dev.vars` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and, for each deployed environment, `wrangler secret put` (§5).

---

## 7. Microsoft SSO

1. Open <https://entra.microsoft.com/> → *Applications* → *App registrations* → **New registration**.
2. **Name:** `pm-sso`. **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*.
3. **Redirect URI:** platform **Web**, `http://localhost:5173/auth/microsoft/callback`. Register.
4. *Authentication* → add the other redirect URIs (dev, staging, production), in the same form as §6 with `microsoft` in place of `google`.
5. *Certificates & secrets* → **New client secret** → copy the **Value** (not the Secret ID), which is shown once.
6. *Overview* → copy the **Application (client) ID**.
7. Put them in `.dev.vars` (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`) and the deployed environments' Worker secrets.

---

## 8. Slack

1. Open <https://api.slack.com/apps> → **Create New App** → *From scratch* → name `PM Bot` → pick your workspace.
2. *OAuth & Permissions* → *Bot Token Scopes* → add **`chat:write`**.
3. **Install to Workspace** → allow → copy the **Bot User OAuth Token** (starts with `xoxb-`).
4. In Slack, open the project channel → `/invite @PM Bot`.
5. Get the **channel ID**: open the channel → click its name → the ID is at the bottom of the *About* tab (starts with `C`).
6. Put the token in `SLACK_BOT_TOKEN` (`.dev.vars` and Worker secrets). Put the channel ID in the project's **Settings → Slack channel ID** field in the app, not in any file.

---

## 9. Email Provider (later)

Nothing to do now: `EMAIL_PROVIDER=console` logs every email. When a provider and a sending domain are chosen, follow [Background jobs §5.2, "Adding a provider later"](./07-background-jobs-and-integrations.md#52-email): add its API key as a Worker secret and to `.dev.vars.example`, and set `EMAIL_PROVIDER` in `wrangler.jsonc`.

---

## Checklist

- [ ] §1 `apps/web/.dev.vars` reviewed, `ADMIN_SEED_EMAIL` set
- [ ] §2 Cloudflare account, Account ID noted, `workers.dev` subdomain chosen, R2 enabled (R6 outcome recorded)
- [ ] §2 D1 databases and R2 buckets created; `database_id`s pasted into `wrangler.jsonc`
- [ ] §3 API token created
- [ ] §4 GitHub environments `dev`, `staging`, `production`, each with 2 secrets and `WORKER_URL`
- [ ] §5 `SESSION_SECRET` and admin seed secrets set for each environment
- [ ] §6 Google SSO credentials in `.dev.vars` and Worker secrets
- [ ] §7 Microsoft SSO credentials in `.dev.vars` and Worker secrets
- [ ] §8 Slack bot token in `.dev.vars` and Worker secrets; bot invited to the channel
