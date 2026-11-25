# Implementation Plan — M1-T5: Separate Layouts (AdminShell & MemberShell)

> **Task ID**: `M1-T5`  
> **Branch**: `fix/separate-layouts` (stacked on PR #9 `feature/user-management`)  
> **Authoritative Specs**: [`docs/05-rbac-and-workflow.md` §4](file:///D:/MHT_Intern_Assignment/docs/05-rbac-and-workflow.md), [`docs/06-routes-and-actions.md` §2](file:///D:/MHT_Intern_Assignment/docs/06-routes-and-actions.md), [`docs/10-implementation-roadmap.md` §2.5](file:///D:/MHT_Intern_Assignment/docs/10-implementation-roadmap.md)  
> **Standards**: [`AGENTS.md` §2.1, §5.5](file:///D:/MHT_Intern_Assignment/AGENTS.md)

---

## 1. Goal & Requirements
Enforce two isolated UI layouts and strict route protection:
1. **Admin/PM Layout (`AdminShell`)**:
   - Used by system `ADMIN` and `PM`.
   - Nav items: Dashboard (`/admin`), Projects (`/projects`), Users (`/admin/users` - Admin only), Statuses (`/admin/statuses` - Admin only), Audit log (`/admin/audit-log` - Admin only), My tasks (`/my-tasks`), Notifications (`/notifications`), Calendar (`/calendar`), Profile (`/profile`), and Logout (`/logout`).
2. **Member Layout (`MemberShell`)**:
   - Used by system `TEAM_LEAD` and `MEMBER`.
   - Nav items: Dashboard (`/`), My tasks (`/my-tasks`), My projects (`/projects`), Notifications (`/notifications`), Calendar (`/calendar`), Profile (`/profile`), and Logout (`/logout`).
3. **Pathless Layout Route (`_app.tsx`)**:
   - Protects all child routes with `requireUser`.
   - Dynamically selects `AdminShell` or `MemberShell` based on `user.systemRole`.
4. **Admin Route Guard (`_app.admin.tsx`)**:
   - Protects `/admin/*` routes with `requireSystemRole(user, ["ADMIN", "PM"])`.
   - Throws 403 Forbidden for non-admin/PM users (`MEMBER`, `TEAM_LEAD`).
5. **Redirect Rules**:
   - Unauthenticated access to any protected route redirects to `/login?redirectTo=<current_path>`.
   - Authenticated `ADMIN` or `PM` visiting `/` redirects to `/admin`.
   - Authenticated `MEMBER` or `TEAM_LEAD` visiting `/admin/*` receives 403 Forbidden.

---

## 2. File Architecture & Changes

### A. Components (`apps/web/app/components/layouts/`)
- `AdminShell.tsx`: Renders navigation sidebar/header with admin/PM links, current user badge, and `<main>{children}</main>`.
- `MemberShell.tsx`: Renders navigation sidebar/header with member links, current user badge, and `<main>{children}</main>`.

### B. Routes (`apps/web/app/routes/`)
- `_app.tsx`: Pathless layout loader calling `requireUser(ctx, request)`, rendering `AdminShell` or `MemberShell` with `<Outlet />`.
- `_app._index.tsx`: Member home dashboard. Loader calls `requireUser` and redirects `ADMIN`/`PM` to `/admin`.
- `_app.admin.tsx`: Layout guard for `/admin/*`. Loader calls `requireSystemRole(user, ["ADMIN", "PM"])`. Renders `<Outlet />`.
- `_app.admin._index.tsx`: Admin home dashboard (`/admin`).
- Rename `admin.users.tsx` to `_app.admin.users.tsx`: Renders at `/admin/users` within the `_app` and `_app.admin` layouts.
- Remove old standalone `_index.tsx`.
- Update `root.tsx` ErrorBoundary to render 403 Forbidden explicitly.

### C. Utilities & Auth (`apps/web/app/utils/`)
- Ensure `requireSystemRole` throws a 403 `data({ message: ... }, { status: 403 })` or `new Response(..., { status: 403 })` recognizable by React Router's `isRouteErrorResponse` as 403.

### D. Tests
- `apps/web/test/layouts/shells.test.tsx`: Component tests for `AdminShell` and `MemberShell`.
- `apps/web/test/layouts/appLoader.test.ts`: Unit tests for `_app` loader, `_app.admin` loader, and `_app._index` loader.
- `apps/web/e2e/layouts.spec.ts`: E2E test verifying role-based shell rendering, redirect from `/` to `/admin` for admin, and 403 on `/admin` for member.

---

## 3. Verification Commands
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm spell`
- `pnpm deps:check`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm test:e2e`
- Simulated CI: isolated `.dev.vars` + isolated state.
