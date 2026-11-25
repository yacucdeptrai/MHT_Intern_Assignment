# Code Review Feedback and Lessons Learned

> **Source:** [`nativedocs/09-code-review-feedback.md`](../nativedocs/09-code-review-feedback.md) (sheet `Feedback` in `Tài liệu cho intern_Hoành_Anh.xlsx`)
> **Goal:** record, analyze, and explain how to fix the **18 real defects** found in code reviews during development. Use it as study material and as a reference for code quality and architectural thinking.

> **Adapted for this project:** the findings below are the **original findings** from a Prisma/MySQL codebase, kept as they were reported. After each case study, an "In this stack" note links to the rule that now prevents the issue. The full lesson-to-rule-to-test map is in [Testing strategy §6](../09-testing-strategy.md#6-review-lesson-regression-map). The source's README says 19 findings, but its table lists 18; this guide follows the table.

---

## 1. Severity Breakdown

| Severity | Count | Share (%) | Handling priority |
| :--- | :---: | :---: | :--- |
| 🔴 **Critical** | **1** | 5.5% | Fix immediately; it breaks the exception-handling flow. |
| 🟠 **High** | **2** | 11.1% | Directly affects data integrity (transactions) and input validation / security. |
| 🟡 **Medium** | **8** | 44.4% | Type safety, session handling, user experience, and architecture design. |
| 🟢 **Low** | **5** | 27.8% | Magic numbers, hardcoded values, query indexes, and English grammar. |
| ⚪ **Minor** | **2** | 11.1% | File-name typos. |
| **Total** | **18** | **100%** | Every finding has a recommended fix. |

---

## 2. The 18 Findings

| # | Category | Location | Issue | Impact and risk | Recommendation | Severity |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **01** | **Naming & Typos** | `src/app/repositories/notificatonRepository.ts` | The file name is missing an `i` (`notificaton` → `notification`). | Makes searching for the file harder and looks unprofessional. | Rename to `notificationRepository.ts` and update every related import. | `Minor` |
| **02** | **Naming & Typos** | `src/app/services/projectMemeber.service.ts` | Misspelled file name (`Memeber` → `Member`). | Harder to search for and confusing for other developers on the team. | Rename to `projectMember.service.ts` and fix the import paths. | `Minor` |
| **03** | **Consistency** | `src/app/repositories/userRepository.ts` | `findById` uses the global `prisma` client instead of the injected `db` parameter. | **Transactions cannot be consistent.** If the user data must roll back together with other tables in one transaction, this query is not managed by `tx`. | Change `prisma` to `db` (the variable injected by `createRepository` / `baseRepository`). | `High` |
| **04** | **Logic & Syntax** | `src/app/services/project.service.ts` *(line 94)* | Comma operator misused in a throw: `throw (new AppError("..."), 403)`. | **Serious logic bug:** JavaScript throws the number `403` instead of the Error object. The catch block cannot read `.message` or the stack trace. | Use valid constructor arguments: `throw new AppError("Only the project creator has delete rights", 403)`. | `Critical` |
| **05** | **Validation** | `src/app/actions/managementUserAction.ts` *(and other actions)* | No input validation layer (such as Zod); manual casts (`as string`). | Junk or malicious data can reach the database; runtime crashes when a client omits a field or sends the wrong format. | Use a Zod schema to parse and validate input at the start of the action, before calling the Service. | `High` |
| **06** | **Type Safety** | `src/app/components/Form/UserForm.tsx` | `any` used for `props`. | Loses all of TypeScript's type safety; easy to mistype property names (e.g. `data.fullname` instead of `data.fullName`). | Define a specific interface for the user data, or use `Prisma.UserGetPayload` generated from the schema. | `Medium` |
| **07** | **Coding Standards** | Whole project | `any` is used far too often for a professional TypeScript project. | TypeScript becomes a JavaScript "shell"; serious runtime errors become more likely. | Plan a gradual refactor replacing every `any` with specific types or interfaces, union types, or generics. | `Medium` |
| **08** | **Security** | `src/app/utils/auth.server.ts` | `requireAdmin` silently redirects to the home page `'/'` when the user lacks permission. | Poor experience (users do not understand why they were kicked out), and a possible redirect loop. | Redirect to `'/login'` with `?redirectTo=...`, so the user can sign in with the right account and return to the same page. | `Medium` |
| **09** | **Coding Standards** | `src/app/services/project.service.ts` | Magic number for the token lifetime: `7 * 24 * 60 * 60 * 1000`. | Hard to understand and maintain; easy to get wrong when the policy changes. | Move it to `constants.ts`, e.g. `export const TOKEN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;`. | `Low` |
| **10** | **English Usage** | `src/app/services/projectInvite.service.ts` *(line 53)* | Serious grammar and spelling mistakes in a message: `"Users does not exits"`. | Looks unprofessional to clients and other developers reading logs or API error codes. | Use correct English: `"User does not exist"`. | `Low` |
| **11** | **English Usage** | `src/app/services/project.service.ts` *(line 53)* | Ungrammatical, meaningless text: `"clib"`. | The error message means nothing to users or maintainers. | Make it clear: `"You are not a member of this project"`. | `Low` |
| **12** | **Type Safety** | `src/app/services/projectInvite.service.ts` *(lines 33, 75)* | Results from the repository are cast to `any`. | Type control is lost in every later layer; risk of accessing properties that do not exist (`undefined`). | Use the types emitted by the Prisma client, or define a specific interface for the query result. | `Medium` |
| **13** | **Hardcoded Values** | `src/app/services/notification.service.ts` *(line 92)* | A category value is hardcoded as a string: `entityType: "PROJECT" as const`. | Hard to extend; conflicts are likely when entity types change or new ones are added (TASK, COMMENT). | Define `EntityType` as an enum in `schema.prisma`, so code and database stay consistent. | `Low` |
| **14** | **Frontend Logic** | `src/app/routes/_protected/managementUser.tsx` | `form.resetFields()` is called in `useEffect` without checking for success. | Users lose everything they typed when the server returns a business error (e.g. the email already exists). | Reset the form only on a success flag: `if (actionData?.success) form.resetFields();`. | `Medium` |
| **15** | **UX & UI** | `src/app/routes/_protected/managementUser.tsx` | The table scroll height is a hardcoded fixed value: `y: 100 * 5`. | The table breaks or does not adapt on devices and screens with different resolutions. | Use relative `vh` units in CSS, or compute the height from the viewport size. | `Low` |
| **16** | **Logging** | All actions | Logs lack context (e.g. only `"User updated success"`, with no ID). | Makes it very hard for operations to trace logs in Production when investigating incidents. | Add `userId`, `targetId`, or `requestId` to every important log statement. | `Medium` |
| **17** | **Performance** | `src/app/repositories/userRepository.ts` *(line 61)* | Runs a search and a count (`findMany` and `count`) together with `Promise.all`, without index optimization. | Query performance degrades badly as the `User` table grows. | Review the fields used in the filters' `where` clauses and add suitable composite indexes in `schema.prisma`. | `Low` |
| **18** | **Code Smells** | `src/app/services/projectInvite.service.ts` *(lines 92–121)* | Complex logic that finds and updates notifications by metadata fields, nested inside a transaction. | Bulky, hard-to-read code; breaks easily when the metadata structure changes, and holds the transaction lock longer. | Extract the metadata query into a dedicated repository helper method for reuse. | `Medium` |

---

## 3. Case Studies

### Case 1: the comma operator in `throw` (Critical)

```typescript
// ❌ ORIGINAL CODE (SERIOUS BUG):
// In JavaScript, the comma operator evaluates each expression from left to right
// and returns the value of the last one.
// So the expression (new AppError("..."), 403) evaluates to the number 403!
throw (new AppError("Only the project creator has delete rights"), 403);

// What happens in the catch block:
try {
  // ...
} catch (error) {
  console.log(error.message); // undefined! error is the number 403, not an Error instance
}

// ✅ CORRECTED CODE:
throw new AppError("Only the project creator has delete rights", 403);
```

> **In this stack:** `AppError` subclasses (`ForbiddenError`, …) are thrown directly ([Architecture §4.4](../02-architecture.md#44-error-model)). ESLint `no-sequences` and `@typescript-eslint/only-throw-error` reject the original form.

---

### Case 2: losing transaction consistency in a repository (High)

```typescript
// ❌ ORIGINAL CODE (TRANSACTION BUG):
export class UserRepository {
  async findById(id: string, db: PrismaClientOrTx) {
    // Mistake: ignores the injected db and calls the global prisma directly
    return prisma.user.findUnique({ where: { id } });
  }
}

// Consequence when UserRepository is called inside a $transaction:
await prisma.$transaction(async (tx) => {
  await userRepository.findById(userId, tx); // runs on a separate connection, NOT inside tx!
  await otherRepository.update(..., tx);
  // If the update fails, the data from findById and related notes are not rolled back together!
});

// ✅ CORRECTED CODE:
export class UserRepository {
  async findById(id: string, db: PrismaClientOrTx) {
    return db.user.findUnique({ where: { id } }); // always runs in the tx context
  }
}
```

> **In this stack:** D1 has no interactive transactions, so the lesson is applied through batches. Every repository method takes `db: AppDatabase` first, and multi-row writes are a single `db.batch([...])` assembled in the service, with `conflictGuardStmt` after conditional updates ([Data access §2–§3](../04-data-access-and-atomicity.md#2-repository-conventions)).

---

### Case 3: missing validation in the action layer (High)

```typescript
// ❌ ORIGINAL CODE (NO CONTROL):
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string; // dangerous: blind cast
  const role = formData.get("role") as string;

  return await userService.createUser({ email, role });
}

// ✅ CORRECTED CODE WITH ZOD:
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  role: z.enum(["MEMBER", "TEAM_LEAD", "PM", "ADMIN"]),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);

  const result = CreateUserSchema.safeParse(rawData);
  if (!result.success) {
    return json({ errors: result.error.flatten().fieldErrors, success: false }, { status: 400 });
  }

  const newUser = await userService.createUser(result.data);
  return json({ data: newUser, success: true }, { status: 201 });
}
```

> **In this stack:** every action parses its `intent` and payload with a Zod schema from `packages/domain/src/schemas/`, and Update schemas derive from Create schemas ([Routes §1, §4](../06-routes-and-actions.md#1-conventions)).
