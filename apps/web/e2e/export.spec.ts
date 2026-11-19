import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

import { EXPORT_COLUMNS } from "@pm/domain";

import { createSignedInMember, setupProjectWithTask, signInAsAdmin } from "./helpers";

test.describe("E2E Journey 8: Project Data Export (FR-32)", () => {
  test("PM/Admin exports CSV and XLSX via browser UI; member receives 403 Forbidden", async ({ browser, page }) => {
    test.setTimeout(60000);

    // 1. Create dedicated member user
    const member = await createSignedInMember(browser, "MEMBER");

    // 2. Setup project with a task containing formula injection target and member
    const formulaTitle = "=cmd|' /C calc'!A0";
    const { projectId, projectCode } = await setupProjectWithTask(browser, {
      taskTitle: formulaTitle,
      members: [{ user: member, projectRole: "MEMBER" }],
    });

    // 3. Admin signs in and navigates to Reports page
    await signInAsAdmin(page);
    await page.goto(`/projects/${projectId}/reports`);
    await expect(page.getByTestId("project-reports-page")).toBeVisible();

    // 4. Admin clicks "Export CSV" and downloads the file
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-csv-btn").click(),
    ]);
    expect(csvDownload.suggestedFilename()).toBe(`${projectCode}-tasks.csv`);
    const csvPath = await csvDownload.path();
    if (!csvPath) throw new Error("CSV download path not found");
    const csvContent = readFileSync(csvPath, "utf-8");
    expect(csvContent.startsWith("\uFEFF")).toBe(true);
    expect(csvContent).toContain(EXPORT_COLUMNS.join(","));
    expect(csvContent).toContain("'=cmd"); // prefixed with '

    // 5. Admin clicks "Export Excel", builds in browser and downloads .xlsx
    const [xlsxDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-xlsx-btn").click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toBe(`${projectCode}-tasks.xlsx`);
    const xlsxPath = await xlsxDownload.path();
    if (!xlsxPath) throw new Error("XLSX download path not found");
    const xlsxBuffer = readFileSync(xlsxPath);
    const workbook = XLSX.read(xlsxBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0] ?? "";
    const sheet = workbook.Sheets[sheetName] ?? {};
    const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    expect(sheetRows[0]).toEqual([...EXPORT_COLUMNS]);
    expect(sheetRows.length).toBeGreaterThan(1);
    const formulaRow = sheetRows.find((r) => r[1]?.startsWith("'="));
    expect(formulaRow).toBeDefined();

    // 6. Member tries the export endpoints -> receives 403 Forbidden
    const memberCsvRes = await member.page.request.get(`/api/projects/${projectId}/export?format=csv`);
    expect(memberCsvRes.status()).toBe(403);

    const memberRowsRes = await member.page.request.get(`/api/projects/${projectId}/export?format=rows`);
    expect(memberRowsRes.status()).toBe(403);

    // 7. Non-member user tries export endpoints -> receives 404 Not Found
    const nonMember = await createSignedInMember(browser, "MEMBER");
    const nonMemberCsvRes = await nonMember.page.request.get(`/api/projects/${projectId}/export?format=csv`);
    expect(nonMemberCsvRes.status()).toBe(404);

    const nonMemberRowsRes = await nonMember.page.request.get(`/api/projects/${projectId}/export?format=rows`);
    expect(nonMemberRowsRes.status()).toBe(404);

    await member.context.close();
    await nonMember.context.close();
  });
});
