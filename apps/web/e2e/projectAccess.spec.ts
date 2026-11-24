import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("M2-T2: Project Visibility & Access Control (P3 / FR-16)", () => {
  test("non-member navigating to a project receives 404 Not Found", async ({ browser, page }) => {
    // 1. Admin signs in and creates a new project
    await signInAsAdmin(page);
    await page.goto("/projects/new");

    const code = `SEC${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const name = `Confidential Project ${code}`;

    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(name);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByTestId("submit-project-button").click();

    await page.waitForURL("**/projects");
    await expect(page.getByTestId(`project-row-${code}`)).toBeVisible();

    // Navigate to the newly created project as Admin to verify it exists and retrieve URL
    await page.getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/**");
    const projectUrl = page.url();
    expect(projectUrl).toContain("/projects/");

    // Admin sees the project title and header
    await expect(page.getByTestId("project-title")).toHaveText(name);

    // 2. A non-member signs in
    const nonMember = await createSignedInMember(browser, "MEMBER");

    // 3. Non-member attempts to access the confidential project URL directly
    await nonMember.page.goto(projectUrl);

    // 4. Must see the 404 Not Found page, never a 403 or the project details
    await expect(nonMember.page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(nonMember.page.getByText("The requested page could not be found.")).toBeVisible();
    await expect(nonMember.page.getByTestId("project-header")).not.toBeVisible();
    await expect(nonMember.page.getByRole("main").getByText(name)).not.toBeVisible();

    await nonMember.context.close();
  });
});
