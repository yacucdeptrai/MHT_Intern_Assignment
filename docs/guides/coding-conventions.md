# Coding Conventions and Clean Architecture

> **Source:** [`nativedocs/08-coding-conventions.md`](../nativedocs/08-coding-conventions.md) (sheet `Coding convention` in `Tài liệu cho intern_Hoành_Anh.xlsx`)
> **Goal:** standardize coding style, naming conventions, and code quality across the TypeScript / React / React Router codebase.

> **Adapted for this project:** paths change from `src/app/...` to the monorepo layout ([Architecture §2](../02-architecture.md#2-monorepo)). Repositories and models move to `packages/db`, and models are Drizzle-inferred types. The naming rules themselves are unchanged. Adapted lines are marked.

---

## 1. Naming Conventions

### 1.1 File extensions
- Every file containing UI code (React components / JSX) uses the **`.tsx`** extension.
- Pure TypeScript logic files (Action, Loader, Service, Repository, Model, Utils) use **`.ts`**.

---

### 1.2 Folders and files
- **Folder names** are always **`kebab-case`** (lower case, separated by hyphens).
  *Example:* `src/app/repositories/`, `src/app/project-management/`. *Adapted:* `apps/web/app/services/`, `packages/db/src/repositories/`.
- **Component files** use **`PascalCase`**, and the component name must exactly match the file name. Each component should live in its own file, except very small stateless or pure components used only inside that file.
  *Example:* `ReservationCard.tsx`, `UserForm.tsx`.
- **Non-component files (styles, helpers)** use **`camelCase`** or **`kebab-case`**.
  *Example:* `reservationCardStyle.js`, `formatDate.ts`.

---

### 1.3 Variables and constants
- **Variables** are **`camelCase`**, in clear English. Never use vague generic names (avoid `data`, `item`, `res`, `tmp`).
  *Good examples:*
  ```typescript
  import ReservationCard from './ReservationCard';

  const reservationItem = <ReservationCard />;
  const activeUserCount = 42;
  ```
- **Boolean variables** must start with a prefix that makes the true/false meaning obvious:
  - `is` + adjective: `isActive`, `isLoading`, `isCompleted`, `isAdmin`.
  - `can` + verb: `canDelete`, `canEditProject`, `canApproveTask`.
  - `has` + past participle or noun: `hasPermission`, `hasLoggedOut`, `hasToken`.
- **Constants** are **`UPPER_SNAKE_CASE`** (upper case, separated by underscores).
  *Example:*
  ```typescript
  export const CREATE_LABEL = "Create";
  export const MAX_RETRY_ATTEMPTS = 3;
  export const TOKEN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  ```

> **Adapted for this project:** shared constants live in `packages/domain/src/constants.ts`, app-only constants in `apps/web/app/constants/`. User-facing labels such as `CREATE_LABEL` come from the i18n files, not constants.

---

### 1.4 Functions
- **`camelCase`**. A function name is a verb phrase that describes exactly what it does.
  *Example:* `onNextStep()`, `onSearchCategory()`, `calculateProgress()`, `validateUserProfile()`.

---

### 1.5 Component props
- **`camelCase`**.
- Do not reuse names of built-in HTML and React attributes (such as `style`, `className`, `key`, `id`) unless you are deliberately wrapping the native element.
  *Example:* `onStatusChange`, `userProfileData`, `isReadonly`.

---

### 1.6 Architectural layers and file conventions

The project uses a clean layered architecture:

| Layer | Folder | Extension | Casing | Example file names | Responsibility |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Actions** | `src/app/actions/` | `.ts` | `camelCase` | `userAction.ts`<br>`managementUserAction.ts` | Receive mutation requests, validate input with a Zod schema, call the Service. |
| **Loaders** | `src/app/loaders/` | `.ts` | `camelCase` | `userLoader.ts`<br>`projectDetailsLoader.ts` | Fetch the initial server-side data that a screen renders. |
| **Services** | `src/app/services/` | `.ts` | `camelCase` | `userService.ts`<br>`projectMemberService.ts` | Business logic, authorization checks, transaction orchestration. |
| **Repositories** | `src/app/repositories/` | `.ts` | `camelCase` | `userRepository.ts`<br>`notificationRepository.ts` | Talk to the database through the Prisma client / transaction client (`tx`). |
| **Models** | `src/app/models/` | `.ts` | `PascalCase` | `UserModel.ts`<br>`ProjectModel.ts` | Types, interfaces, and entity schemas. |
| **Routes** | `src/app/routes/` | `.ts` / `.tsx` | `kebab-case` | `user-category.ts`<br>`management-user.tsx` | URL endpoints in Remix / Next.js. |

> **Adapted for this project:** the layers and their locations are:
>
> | Layer | Location | Naming | Example |
> | :--- | :--- | :--- | :--- |
> | Actions | `apps/web/app/actions/` | `camelCaseAction.ts` | `managementUserAction.ts` |
> | Loaders | `apps/web/app/loaders/` | `camelCaseLoader.ts` | `projectDetailsLoader.ts` |
> | Services | `apps/web/app/services/` | `camelCase.service.ts` | `projectMember.service.ts` |
> | Repositories | `packages/db/src/repositories/` | `camelCase.repository.ts` | `notification.repository.ts` |
> | Models | `packages/db/src/schema/` (tables, inferred `InferSelectModel` types) and `packages/db/src/types.ts` (DTOs) | `camelCase.ts`; types are `PascalCase` (`TaskRow`, `TaskDto`) | `tasks.ts` |
> | Domain rules | `packages/domain/src/` | `camelCase.ts` | `workflow.ts`, `policies/task.ts` |
> | Routes | `apps/web/app/routes/` | flat file routes (`@react-router/fs-routes`), kebab-case segments | `_app.projects.$projectId.tasks.$taskId.tsx` |
> | Server-only modules | anywhere in `apps/web/app/` | `*.server.ts` | `auth.server.ts` |
>
> Repositories use an injected `db: AppDatabase` (Drizzle on D1), never a Prisma client or a global ([Data access §2](../04-data-access-and-atomicity.md#2-repository-conventions)).

---

## 2. Lint and Code Quality

### ESLint and Prettier
- Every source file is checked automatically by `ESLint` and `Prettier`.
- **Pass criteria:**
  - No **errors** and no **warnings** in the terminal output of the lint command.
  - Any suppression comment (`// eslint-disable-next-line`) needs a sound technical reason and Tech Lead approval.

> **Adapted for this project:** `pnpm lint` runs with `--max-warnings 0`. `any`, `@ts-ignore`, and `@ts-nocheck` are banned unless the Tech Lead approves, with an inline justification ([Architecture §3](../02-architecture.md#3-layers)).

### Code smell analysis with SonarQube
- The project encourages integrating **SonarQube** into the CI pipeline to scan automatically for:
  - Duplicated code.
  - High cyclomatic complexity.
  - Unused variables or imports, and uncontrolled `any`.
  - Common security hotspots and vulnerabilities.

> **Adapted for this project:** SonarQube is optional and not part of the current `ci.yml`. ESLint rules (`no-explicit-any`, `no-unsafe-*`, `complexity`) and `madge` cover the same ground in CI.

---

## 3. Common Mistakes to Avoid

```typescript
// ❌ WRONG: misspelled name, any, magic number
// File: src/app/services/projectMemeber.service.ts
export const addMemeber = async (data: any) => {
  const expiry = 604800000; // Magic number!
  return db.member.create({ data });
};

// ✅ RIGHT: correct name, explicit types, constant extracted
// File: src/app/services/projectMember.service.ts
import { ProjectMemberInput } from '~/models/ProjectMemberModel';
import { TOKEN_INVITE_EXPIRY_MS } from '~/constants';

export const addMember = async (
  memberData: ProjectMemberInput,
  tx: PrismaTransactionClient
) => {
  return projectMemberRepository.create(memberData, tx);
};
```

> **Adapted for this project:** the same "right" example in this stack:
> ```typescript
> // File: apps/web/app/services/projectMember.service.ts
> import type { MemberAddInput } from '@pm/domain';
> import { projectMemberRepository, auditLogRepository } from '@pm/db';
>
> export const addMember = async (ctx: RequestContext, input: MemberAddInput): Promise<void> => {
>   // authorize, pre-read, then one atomic batch (catalog A4)
>   await ctx.db.batch([
>     projectMemberRepository.insertStmt(ctx.db, input),
>     auditLogRepository.insertStmt(ctx.db, memberAddedAudit(ctx, input)),
>   ]);
> };
> ```
