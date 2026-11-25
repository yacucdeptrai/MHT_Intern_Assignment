# Project & Task Management System — Documentation

This folder is the English build blueprint for the **Project & Task Management System**: an internal platform for one organization to manage users, projects, sprints, and tasks. It covers approval workflow, realtime notifications, Slack and email integrations, reports, and dashboards.

- **PM:** `thang.le2`
- **PIC:** `Hoàng Anh`
- **Stack:** React Router v8 (framework mode, successor of Remix) on Cloudflare Workers, D1 with Drizzle ORM, R2, Durable Objects, Cron Triggers, pnpm monorepo, Ant Design, Tailwind, Zod, Vitest, Playwright, GitHub Actions.

## Reading Order

1. [SRS](./01-srs.md): what the system must do.
2. [Architecture](./02-architecture.md): how it is structured.
3. [Database design](./03-database-design.md): the data model.
4. [Data access & atomicity](./04-data-access-and-atomicity.md): how writes stay consistent on D1.
5. [RBAC & workflow](./05-rbac-and-workflow.md): who can do what, and how tasks move.
6. [Routes & actions](./06-routes-and-actions.md): every page, action, and endpoint.
7. [Background jobs & integrations](./07-background-jobs-and-integrations.md): the outbox, cron, realtime, Slack, email, files, SSO.
8. [Dev environment & deployment](./08-dev-environment-and-deployment.md): local setup and the delivery pipeline.
9. [Testing strategy](./09-testing-strategy.md): what is tested, how, and why.
10. [Implementation roadmap](./10-implementation-roadmap.md): the build order, as PR-sized tasks.

Then the process guides, the risk register, and the WBS tracking sheet.

## Documents

| Document | Summary |
| :--- | :--- |
| [01 SRS](./01-srs.md) | Decisions P1–P21; FR-01…FR-37 with Given/When/Then acceptance criteria; NFRs; out of scope; traceability to the WBS |
| [02 Architecture](./02-architecture.md) | One Worker; monorepo packages and dependency rule; layer responsibilities; request lifecycle; error model; logging; Free plan notes; exceptions to `AGENTS.md` |
| [03 Database design](./03-database-design.md) | ERD; all tables with columns and constraints; enums; indexes with the query each serves; Drizzle schema sketch; migrations; seed data |
| [04 Data access & atomicity](./04-data-access-and-atomicity.md) | Repository conventions; the batch pattern and version guard; the atomic operations catalog (A1–A28); what happens after commit |
| [05 RBAC & workflow](./05-rbac-and-workflow.md) | System vs project roles; project access (404 for non-members); permission matrix; layouts; policy functions; status categories and transitions |
| [06 Routes & actions](./06-routes-and-actions.md) | Route tree; loader data and `intent`-based actions per route; resource routes; validation parity |
| [07 Background jobs & integrations](./07-background-jobs-and-integrations.md) | Transactional outbox; cron; idempotency; Durable Object realtime hub; Slack; email abstraction; R2; SSO; deadline scan; Queues upgrade path |
| [08 Dev environment & deployment](./08-dev-environment-and-deployment.md) | Prerequisites; commands; `wrangler.jsonc`; variables and secrets; Cloudflare resources; CI/CD; rollback; plan limits |
| [09 Testing strategy](./09-testing-strategy.md) | Test pyramid; isolation; permission, workflow, atomicity, and job suites; E2E journeys; review-lesson regression map |
| [10 Implementation roadmap](./10-implementation-roadmap.md) | Milestones M0–M9 with PR-sized tasks, branches, dependencies, and acceptance checks; coverage and WBS mapping |
| [11 Risks & assumptions](./11-risks-and-assumptions.md) | R1–R9, A1–A2, accepted limitations |
| [Environment setup](./environment-setup.md) | Every secret, account, and value to provide (local, Cloudflare, GitHub, SSO, Slack), with step-by-step instructions |
| [WBS tracking sheet](./wbs.md) | WBS rows with dates, estimates, and status, owned by the PIC |

### Process guides

| Guide | Summary |
| :--- | :--- |
| [Status flow](./guides/status-flow.md) | The 9 team progress statuses and their percentages |
| [Git flow](./guides/git-flow.md) | Branches, deploy flow, Conventional Commits, PR and review rules, security |
| [PR review rules](./guides/pr-review-rules.md) | Review requests, PR sidebar settings, the PR template |
| [Pre-push checklist](./guides/pre-push-checklist.md) | The 13 self-check items before pushing |
| [Coding conventions](./guides/coding-conventions.md) | Naming, layer file conventions, lint and quality rules |
| [Code review lessons](./guides/code-review-lessons.md) | The 18 review findings and how this stack prevents them |
| [Agent task prompt](./guides/agent-task-prompt.md) | Copy-paste prompt that makes any coding agent implement one roadmap task to project standards |

## Precedence

1. **These documents override `nativedocs/`.** [`nativedocs/`](./nativedocs/README.md) holds the original Vietnamese material converted from `Tài liệu cho intern_Hoành_Anh.xlsx`. It is kept unchanged for reference.
2. **[`AGENTS.md`](../AGENTS.md) governs engineering and agent behavior**, except where [Architecture §6](./02-architecture.md#agents-md-exceptions) lists an exception.
3. The approved design these documents were written from is [`superpowers/specs/2026-11-16-project-docs-design.md`](./superpowers/specs/2026-11-16-project-docs-design.md).
