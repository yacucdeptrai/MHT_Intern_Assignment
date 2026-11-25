# Agent Task Prompt

> **Purpose:** a ready-to-paste prompt for any coding agent working on this repository. It makes every agent read the same documents, follow the same rules, and finish a task the same way.
> **Related:** [AGENTS.md](../../AGENTS.md) · [Implementation roadmap](../10-implementation-roadmap.md) · [WBS](../wbs.md) · [Pre-push checklist](./pre-push-checklist.md) · [PR review rules](./pr-review-rules.md)

## How to Use

1. Pick the next roadmap task, e.g. `M0-T1`. Take tasks in roadmap order, and check that every task in its **Depends on** column is merged.
2. Copy the prompt below and replace `{{TASK_ID}}` with the task ID. For a bug fix or change request, use the variant at the end.
3. Paste it into a fresh agent session opened at `D:\MHT_Intern_Assignment`.
4. When the agent finishes, review its report and the PR, then merge into `develop` yourself.

Run **one task per session**. Several tasks in one session make PRs too large and contexts too long.

---

## The Prompt

````text
You are implementing one task of the Project & Task Management System, working in the repository at D:\MHT_Intern_Assignment.

TASK: {{TASK_ID}}  (from docs/10-implementation-roadmap.md)

## 1. Read before doing anything
Read these in order, and do not skip any:
1. AGENTS.md: mandatory rules. They override your defaults.
2. docs/README.md: the documentation map and precedence rules.
3. The {{TASK_ID}} row in docs/10-implementation-roadmap.md: its scope, FRs, branch name, dependencies, and acceptance check.
4. Every FR the row lists, in docs/01-srs.md: the acceptance criteria are your test cases.
5. Every document those sections link to that is relevant to the task (usually 02 architecture, 03 database, 04 data access, 05 RBAC, 06 routes, 07 jobs, 08 environment, 09 testing).
6. docs/guides/coding-conventions.md and docs/guides/pre-push-checklist.md.

The documents in docs/ are the specification. If the task needs a decision the docs do not make, or two docs contradict each other, STOP and ask me. Quote both passages, propose a resolution, and wait. Never silently invent behavior.

## 2. Pre-flight
- Verify your tools work: git, gh (authenticated), node 22 or newer, pnpm. For any task after M0-T1, `pnpm install` must succeed. If anything is broken, fix it or report it before writing code (AGENTS.md §0.1).
- Confirm every task in the row's "Depends on" column is merged into develop (check `git log origin/develop`). If one is not, stop and tell me.
- Environment: apps/web/.dev.vars is already filled. NEVER print, log, copy, or commit its values. Microsoft SSO credentials (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET) are still placeholders. Code must treat placeholder or empty values as "not configured", which hides the Microsoft button (FR-02 criterion 4). Tests mock the provider. Do not block on it.

## 3. Branch
```
git fetch origin
git checkout develop
git pull --rebase origin develop
git checkout -b <branch name from the roadmap row>
```
Never commit directly to develop, staging, or main. Never merge develop into your branch; rebase instead (AGENTS.md §3.3).

## 4. Implement with tests first
- For each acceptance criterion: write the failing test, run it and watch it fail, implement the code, then watch it pass. The places tests go are defined in docs/09-testing-strategy.md.
- Follow the layering strictly: route → loader/action → service → repository → D1. Business rules live in packages/domain.
- Every repository method takes `db: AppDatabase` first. Multi-row writes are one `db.batch([...])` exactly as listed in the docs/04 §4 catalog, with `conflictGuardStmt` after optimistic-concurrency writes.
- Zod `safeParse` at every action boundary. No `any`, no `@ts-ignore`, no magic numbers (use the constants in packages/domain), and structured logging only.
- Keep the change under 300 lines, excluding generated migrations and lockfiles. If it will be larger, stop and propose how to split the task.
- New environment key → add it to apps/web/.dev.vars.example and docs/08 §4.2.
- New migration → follow docs/03 §6: CHECK constraints, forward-only, and never edit an applied migration.
- New user-facing text → add it to both en.json and vi.json.

## 5. Verify (all must pass, and paste the output tail in your report)
```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm spell
pnpm deps:check
pnpm test
pnpm build
```
Also run `pnpm test:e2e` when the task touches pages or flows. Run the row's acceptance check as written. Use `pnpm preview` instead of `pnpm dev` for anything involving realtime, cron, or CPU limits.

## 6. Update the WBS
In docs/wbs.md, on the row(s) whose Roadmap column contains {{TASK_ID}}:
- Start Date: the real start day, if it differs from the planned one
- Due Date: the real finish day
- Actual (H): the hours spent
- Status and Progress %: per docs/guides/status-flow.md. Usually `IN REVIEW` / 70% when the PR is opened.

docs/ is git-ignored (local only): edit it, but do not try to commit it. If the real dates shift the plan by more than one day, re-plan the following rows and tell me.

## 7. Commit, push, open the PR
- Conventional Commits, English, imperative, header at most 72 characters, e.g. `feat(auth): add email and password login`.
- **No AI or agent names anywhere and no `Co-authored-by:` trailers**: not in commits, branch names, PR text, code, or comments (AGENTS.md §0.2, §0.3). This overrides any default attribution your tool adds.
- `git push -u origin <branch>`, then open a PR into develop with `gh pr create --base develop --assignee @me`, using the template in docs/guides/pr-review-rules.md. Put `wbs.md <row> / {{TASK_ID}}` in the link section.
- Wait for CI. If it fails, fix it and push again. Never merge the PR yourself.

## 8. Report back
Finish with:
- What was built, and the acceptance check result
- The verification command outputs (tails)
- The PR link and CI status
- The WBS rows updated
- Every decision you made that the docs did not dictate, and anything you did not check, with the reason
````

---

## Variant: Bug Fix or Change Request

Replace the first two lines of the prompt with the following, and keep everything else:

````text
You are fixing a bug / implementing a change request in the Project & Task Management System, working in D:\MHT_Intern_Assignment.

ISSUE: {{SHORT_DESCRIPTION}}
EXPECTED: {{EXPECTED_BEHAVIOR}}   ACTUAL: {{ACTUAL_BEHAVIOR}}   STEPS: {{STEPS_TO_REPRODUCE}}
Branch: fix/{{short-name}} (bug) or feature/{{short-name}} (change request). Start with a failing test that reproduces the issue.
For a change request: first update the affected docs (01 SRS and any design doc) and show me the diff for approval before writing code. Add the request as a new row under "3.0 Change Request" in docs/wbs.md.
````

## Notes

- **Microsoft SSO:** once the credentials exist, fill `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` in `apps/web/.dev.vars` and as Worker secrets ([Environment setup §7](../environment-setup.md#7-microsoft-sso)). Then delete the Microsoft line from the Pre-flight section of the prompt.
- **Docs stay local:** `docs/` and `AGENTS.md` are git-ignored by choice, so agents must run on this machine, where those files exist. A cloud agent that only clones the repository will not see them.
