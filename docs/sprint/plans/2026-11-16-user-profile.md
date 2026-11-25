# User Profile Implementation Plan (M1-T6)

**Goal:** Implement profile viewing, contact details updating, password changing/setting, and avatar upload/serving via Cloudflare R2 (FR-05, FR-06).

**Architecture:** Layered architecture adhering to AGENTS.md:
- Routes: `apps/web/app/routes/_app.profile.tsx` (/profile) and `apps/web/app/routes/api.avatars.$userId.ts` (/api/avatars/:userId)
- Actions/Loaders: Form validation via Zod schemas (`ProfileUpdateSchema`, `ChangePasswordSchema`, avatar validation)
- Services: `profileService` (or `userService` methods for `updateProfile`, `changePassword`, `updateAvatar`)
- Repositories: `userRepository` (`updateStmt`, `findById`) with atomic batch A29 and `conflictGuardStmt`
- Storage: `FileStorage` port backed by `R2FileStorage`

**Tech Stack:** React Router v8, Cloudflare Workers, Cloudflare D1 (SQLite), Cloudflare R2, Drizzle ORM, Zod, Vitest, Playwright.

**Spec:** `docs/01-srs.md` (FR-05, FR-06), `docs/04-data-access-and-atomicity.md` (A29), `docs/06-routes-and-actions.md`.

---

## 1. Domain Types and Schemas (`packages/domain`)

- `ProfileDto`: `{ id: string; email: string; fullName: string; phone: string | null; department: string | null; avatarKey?: string | null; systemRole: SystemRole; createdAt: number; }`
- `MembershipDto`: `{ projectId: string; projectCode: string; projectName: string; projectRole: ProjectRole; }`
- `ProfileUpdateSchema`:
  - `fullName`: string trimmed min 1 max 100
  - `phone`: string trimmed max 30 nullish
- `ChangePasswordSchema`:
  - `currentPassword`: string optional
  - `newPassword`: string min 10 max 128
  - `confirmPassword`: string min 1
  - refine: `newPassword === confirmPassword`
- Constants:
  - `MAX_AVATAR_BYTES = 10 * 1024 * 1024` (10 MB)
  - `ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]`

## 2. Service Layer (`apps/web/app/services/user/profile.service.ts`)

- `getProfile(ctx: RequestContext, userId: string)`:
  - Re-fetches user from `userRepository.findById`.
  - Checks if deleted or locked -> throws NotFoundError / ForbiddenError.
  - Returns `ProfileDto`, empty `MembershipDto[]` (until M2), and `hasPassword: user.passwordHash !== null`.
- `updateProfile(ctx: RequestContext, userId: string, input: ProfileUpdateInput)`:
  - Validates caller is own user.
  - Runs batch: `updateStmt`, `conflictGuardStmt`, audit log `USER_UPDATED`.
- `changePassword(ctx: RequestContext, userId: string, input: ChangePasswordInput)`:
  - Validates caller is own user.
  - Checks existing password hash:
    - If user has password, verify `input.currentPassword`. If invalid -> throw `ValidationError` with `{ currentPassword: ["Current password is incorrect"] }`.
    - If user has no password (SSO-only), no current password required.
  - Hashes new password with PBKDF2 (`hashPassword`).
  - Runs batch: `updatePasswordStmt`, `conflictGuardStmt`, audit log `USER_UPDATED`.
- `updateAvatar(ctx: RequestContext, userId: string, file: { stream: ReadableStream<Uint8Array>; size: number; contentType: string })`:
  - Validates caller is own user.
  - Validates size <= 10MB, contentType in allowed list.
  - Puts file into R2 at `avatars/${userId}`.
  - Runs batch A29:
    - `userRepository.updateStmt(ctx.db, userId, { avatarKey: 'avatars/' + userId, updatedAt: now })`
    - `conflictGuardStmt(ctx.db)`
    - `auditLogRepository.insertStmt(...)` with action `USER_UPDATED`.
  - If batch fails, deletes R2 object in catch block.

## 3. Routes & UI

- `apps/web/app/routes/_app.profile.tsx`:
  - Loader: requires user, calls `profileService.getProfile`.
  - Actions:
    - `intent === "updateProfile"` -> validates with `ProfileUpdateSchema`, calls `profileService.updateProfile`.
    - `intent === "changePassword"` -> validates with `ChangePasswordSchema`, calls `profileService.changePassword`.
  - Component:
    - Profile Information section (Full name, Email readonly, Phone editable, Department readonly, System role readonly).
    - Avatar upload section with file input and preview.
    - Password section (Current password conditional on `hasPassword`, New password, Confirm password).
    - Project Memberships section (shows table / empty state).
- `apps/web/app/routes/api.avatars.$userId.ts`:
  - `loader`: GET `/api/avatars/:userId`:
    - Requires authenticated user.
    - If target user not found / deleted -> 404.
    - If target user has avatar in R2 -> stream with contentType and Cache-Control.
    - If no avatar -> stream default SVG.
  - `action`: POST `/api/avatars/:userId`:
    - Requires caller to be `userId` (own only; otherwise 403).
    - Reads multipart file, calls `profileService.updateAvatar`.
    - Returns `{ success: true, avatarUrl: '/api/avatars/' + userId }`.

## 4. Updates to Shell Components

- `AdminShell.tsx` and `MemberShell.tsx`:
  - Use `/api/avatars/${user.id}` if `user.avatarKey` is present, or fallback initials.

## 5. Testing & Verification

- Unit tests:
  - `packages/domain`: schema validation tests.
  - `profile.service.test.ts`:
    - `getProfile` returns own data.
    - `updateProfile` updates name & phone, writes audit log.
    - `changePassword` with correct current password succeeds.
    - `changePassword` with wrong current password throws 400.
    - `changePassword` for SSO user sets password without current password.
    - `updateAvatar` stores in R2, commits A29 batch, cleans up on failure.
- Route & Action tests:
  - `profileAction.test.ts`:
    - Requires session -> redirect to login.
    - Locked user -> 302 to login.
    - Invalid inputs return 400.
    - Valid inputs update and return success.
  - `avatarRoute.test.ts`:
    - GET returns avatar or default SVG.
    - GET for unknown user -> 404.
    - POST for another user -> 403.
    - POST file > 10MB -> 400.
    - POST invalid mime type -> 400.
    - POST valid file -> 200 with avatarUrl.
- E2E tests:
  - `profile.spec.ts`:
    - Navigate to `/profile`.
    - Update phone number.
    - Change password and verify sign-in with new password.
    - Upload avatar and verify image displays in shell and profile.
