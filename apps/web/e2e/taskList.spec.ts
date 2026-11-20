import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Task List & My Tasks Journey (FR-16)", () => {
  test("FR-16 c1: personal tasks list (/my-tasks) displays tasks and filters by priority", async ({ page }) => {
    await signInAsAdmin(page);

    // 1. Create a project
    await page.goto("/projects/new");
    const code = `MYT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`My Tasks Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/**");

    // 2. Create a task in this project
    const taskTitle = `Personal Task ${code}`;
    await expect(page.getByTestId("create-task-button")).toBeVisible();
    await page.getByTestId("create-task-button").click();
    await expect(page.getByTestId("task-title-input")).toBeVisible();
    await page.getByTestId("task-title-input").fill(taskTitle);
    await page.getByTestId("task-priority-select").selectOption("HIGH");
    const assigneeCheckbox = page.locator('input[name="assigneeIds"]');
    if ((await assigneeCheckbox.count()) > 0) {
      await assigneeCheckbox.first().check();
    }
    await page.getByTestId("task-submit-button").click();

    // Verify task is in project table
    await expect(page.getByText(taskTitle)).toBeVisible();

    // 3. Navigate to /my-tasks
    await page.goto("/my-tasks");
    await expect(page.getByTestId("my-tasks-container")).toBeVisible();
    await expect(page.getByTestId("my-tasks-filter-bar")).toBeVisible();
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test("FR-16 c2 & c3: project tasks view filters by priority and updates URL parameters", async ({ page }) => {
    await signInAsAdmin(page);

    // Create a new project
    await page.goto("/projects/new");
    const code = `FLT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Filter Test Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/**");

    // Create Task 1 (HIGH priority)
    const highTitle = `High Priority Alpha ${code}`;
    await page.getByTestId("create-task-button").click();
    await expect(page.getByTestId("task-title-input")).toBeVisible();
    await page.getByTestId("task-title-input").fill(highTitle);
    await page.getByTestId("task-priority-select").selectOption("HIGH");
    await page.getByTestId("task-submit-button").click();
    await expect(page.getByText(highTitle)).toBeVisible();

    // Create Task 2 (LOW priority)
    const lowTitle = `Low Priority Beta ${code}`;
    await page.getByTestId("create-task-button").click();
    await expect(page.getByTestId("task-title-input")).toBeVisible();
    await page.getByTestId("task-title-input").fill(lowTitle);
    await page.getByTestId("task-priority-select").selectOption("LOW");
    await page.getByTestId("task-submit-button").click();
    await expect(page.getByText(lowTitle)).toBeVisible();

    // Apply Priority=HIGH filter
    // Filters sit behind the Filter button and apply as soon as they change.
    await page.getByTestId("toggle-filters-button").click();
    await page.getByTestId("filter-priority-select").selectOption("HIGH");

    // Check URL has priority=HIGH
    await expect(page).toHaveURL(/priority=HIGH/);

    // Check High Priority Alpha is visible, Low Priority Beta is NOT
    await expect(page.getByText(highTitle)).toBeVisible();
    await expect(page.getByText(lowTitle)).not.toBeVisible();

    // Reset filters
    await page.getByRole("link", { name: "Reset" }).click();
    await expect(page.getByText(highTitle)).toBeVisible();
    await expect(page.getByText(lowTitle)).toBeVisible();
  });

  test("FR-16 c4: non-member receives 404 Not Found on project tasks list", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    await adminPage.goto("/projects/new");
    const code = `NMB${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await adminPage.getByLabel("Project Code").fill(code);
    await adminPage.getByLabel("Project Name").fill(`Non Member Project ${code}`);
    await adminPage.getByLabel("Start Date").fill("2026-11-01");
    await adminPage.getByLabel("End Date").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Create Project" }).click();

    await adminPage.waitForURL("**/projects");
    await adminPage.getByRole("link", { name: code, exact: true }).click();
    await adminPage.waitForURL("**/projects/**");
    const projectUrl = adminPage.url();
    await adminContext.close();

    // Member not in project navigates to projectUrl
    const member = await createSignedInMember(browser, "MEMBER");
    await member.page.goto(projectUrl);
    await expect(member.page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(member.page.getByText("The requested page could not be found.")).toBeVisible();

    await member.context.close();
  });
});
