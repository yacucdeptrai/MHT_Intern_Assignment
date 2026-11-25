# Implementation Plan: M8-T6 Data Export (FR-32)

## Requirements & Scope
- **SRS**: FR-32 c1–3.
- **Roles**: PM or Admin only (`canExportProject`). `TEAM_LEAD` and `MEMBER` receive **403 Forbidden**. Non-members receive **404 Not Found**.
- **Route**: `GET /api/projects/:projectId/export?format=csv|xlsx` (`api.projects.$projectId.export.ts`).
- **Columns (in exact FR-32 c1 order)**:
  1. `code` (e.g. `PRJ-10`)
  2. `title`
  3. `status` (status name)
  4. `category` (TODO, IN_PROGRESS, REVIEW, DONE)
  5. `priority` (LOW, MEDIUM, HIGH, URGENT)
  6. `assignees` (comma-separated full names, or empty)
  7. `sprint` (sprint name, or empty)
  8. `start date` (YYYY-MM-DD or empty)
  9. `due date` (YYYY-MM-DD or empty)
  10. `overdue (yes/no)` ("Yes" or "No", based on `isOverdue` in `APP_TIMEZONE`)
  11. `created at` (formatted timestamp)
  12. `updated at` (formatted timestamp)
- **Formatting**:
  - CSV: UTF-8 with BOM (`\uFEFF`), RFC 4180 escaping for quotes, commas, newlines.
  - XLSX: Generated via official SheetJS `xlsx-0.20.3` (`XLSX.write(wb, { type: "array", bookType: "xlsx" })`).
- **Formula Injection Protection (FR-32 c2 & OWASP)**:
  - If cell value begins with `=`, `+`, `-`, `@`, `\t`, or `\r`, prefix with `'` in both CSV and XLSX.
- **Download Headers**:
  - `Content-Disposition`: `contentDispositionAttachment(fileName)`
  - `Cache-Control`: `private, no-store`
  - `X-Content-Type-Options`: `nosniff`
- **Performance (R1)**:
  - Benchmark export CPU time for 500 tasks, record in `docs/11-risks-and-assumptions.md` R1.
- **E2E**:
  - Journey 8 in `apps/web/e2e/export.spec.ts`.

## Implementation Steps
1. Domain layer:
   - Export helper / sanitizer in `packages/domain/src/export/sanitizeFormula.ts` and `csv.ts`.
2. Database / Repository layer:
   - `taskRepository.listForExport(db, projectId)`: loads non-archived tasks with status, sprint, assignees.
3. Service layer:
   - `exportService.exportTasks(ctx, projectId, format)`: checks `canExportProject`, builds CSV string or XLSX Uint8Array, formats file name.
4. Route handler:
   - `apps/web/app/routes/api.projects.$projectId.export.ts` with format validation (Zod `z.enum(["csv", "xlsx"])`), returning appropriate Response with headers.
5. Tests:
   - Unit tests for formula sanitizer & CSV quoting.
   - Service tests for permissions & data output.
   - Route tests (200 for PM/Admin, 403 for Lead/Member, 404 for non-member).
   - Visibility sweep test addition.
   - Benchmark script / test for CPU time (500 tasks) -> docs/11 R1.
   - Playwright E2E spec (`apps/web/e2e/export.spec.ts`).
