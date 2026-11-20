import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Project Settings & Archive (FR-08 & FR-09)", () => {
  test("FR-08: PM updates project settings and sees updated status in header", async ({ browser }) => {
    const pm = await createSignedInMember(browser, "PM");
    const page = pm.page;

    // Create a new project
    await page.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `S-${uniqueId}`;
    const name = `Settings Project ${uniqueId}`;

    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("input-name").fill(name);
    await page.getByTestId("input-start-date").fill("2026-11-01");
    await page.getByTestId("input-end-date").fill("2026-12-31");
    await page.getByTestId("submit-project-button").click();
    await page.waitForURL("**/projects");

    // Open project and navigate to Settings tab
    await page.getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/*");

    const settingsTab = page.getByRole("main").getByRole("link", { name: "Settings" });
    await expect(settingsTab).toBeVisible();
    await settingsTab.click();
    await page.waitForURL("**/settings");

    // Verify code input is disabled
    await expect(page.getByTestId("input-code")).toBeDisabled();

    // Update settings: name, description, status to ON_HOLD, budget
    const updatedName = `${name} Updated`;
    await page.getByTestId("input-name").fill(updatedName);
    await page.getByTestId("input-description").fill("Updated project description");
    await page.getByTestId("select-status").selectOption("ON_HOLD");
    await page.getByTestId("input-budget").fill("75000000");

    await page.getByTestId("save-settings-button").click();

    // Verify success banner and updated header
    await expect(page.getByTestId("success-banner")).toBeVisible();
    await expect(page.getByTestId("project-title")).toHaveText(updatedName);
    await expect(page.getByTestId("project-header").getByText("On hold")).toBeVisible();

    await pm.context.close();
  });

  test("FR-09: PM archives project, disappears from active list, and Admin sees it in Archived filter", async ({
    browser,
  }) => {
    const pm = await createSignedInMember(browser, "PM");
    const page = pm.page;

    // Create project
    await page.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `A-${uniqueId}`;
    const name = `Archive Test ${uniqueId}`;

    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("input-name").fill(name);
    await page.getByTestId("input-start-date").fill("2026-11-01");
    await page.getByTestId("input-end-date").fill("2026-12-31");
    await page.getByTestId("submit-project-button").click();
    await page.waitForURL("**/projects");

    // Navigate to Settings
    await page.getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/*");
    await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("**/settings");

    // Archive project via Danger Zone
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("archive-project-button").click();
    await page.waitForURL("**/projects");

    // Verify project is no longer visible in active list for PM
    await expect(page.getByTestId(`project-row-${code}`)).not.toBeVisible();

    await pm.context.close();

    // Verify Admin sees it in Archived filter
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);
    await adminPage.goto("/projects");

    const filterTabs = adminPage.getByTestId("projects-filter-tabs");
    await expect(filterTabs).toBeVisible();

    // Project should not appear on active tab
    await expect(adminPage.getByTestId(`project-row-${code}`)).not.toBeVisible();

    // Click Archived tab
    await adminPage.getByTestId("filter-archived").click();
    await adminPage.waitForURL("**/projects?filter=archived");

    // Project should be visible on archived tab
    await expect(adminPage.getByTestId(`project-row-${code}`)).toBeVisible();
    await expect(adminPage.getByTestId(`project-row-${code}`).getByText("ARCHIVED")).toBeVisible();

    await adminContext.close();
  });

  test("FR-08 c3: non-member receives 404 when opening /projects/:projectId/settings directly", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    // Create a project as admin
    await adminPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `N-${uniqueId}`;
    const name = `Non-Member Target ${uniqueId}`;

    await adminPage.getByTestId("input-code").fill(code);
    await adminPage.getByTestId("input-name").fill(name);
    await adminPage.getByTestId("input-start-date").fill("2026-11-01");
    await adminPage.getByTestId("input-end-date").fill("2026-12-31");
    await adminPage.getByTestId("submit-project-button").click();
    await adminPage.waitForURL("**/projects");

    // Get project ID from link
    const projectLink = adminPage.getByRole("link", { name: code, exact: true });
    const href = await projectLink.getAttribute("href");
    const projectId = href?.replace("/projects/", "") ?? "";

    await adminContext.close();

    // Non-member opens settings directly
    const member = await createSignedInMember(browser, "MEMBER");
    const response = await member.page.goto(`/projects/${projectId}/settings`);
    expect(response?.status()).toBe(404);

    await member.context.close();
  });
});
