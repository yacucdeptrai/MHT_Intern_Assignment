import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Task Creation Journey (FR-12)", () => {
  test("FR-12 c1: project creator creates task with title, priority, and dates", async ({ page }) => {
    await signInAsAdmin(page);

    // Create a new project
    await page.goto("/projects/new");
    const code = `TSK${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Task Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page
      .getByRole("main")
      .getByRole("link", { name: `Task Project ${code}` })
      .click();

    // Verify on project overview/tasks page
    await expect(page.getByTestId("create-task-button")).toBeVisible();
    await page.getByTestId("create-task-button").click();

    // Modal opens
    await expect(page.getByTestId("task-title-input")).toBeVisible();
    await page.getByTestId("task-title-input").fill("First Feature Task");
    await page.getByTestId("task-description-input").fill("Implement feature end to end");
    await page.getByTestId("task-priority-select").selectOption("HIGH");
    await page.getByTestId("task-start-date-input").fill("2026-11-05");
    await page.getByTestId("task-due-date-input").fill("2026-11-20");

    await page.getByTestId("task-submit-button").click();

    // Verify task appears in table
    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await expect(page.getByText("First Feature Task")).toBeVisible();
    await expect(page.getByTestId("tasks-table").getByRole("img", { name: "High" })).toBeVisible();
    await expect(page.getByText(`${code}-1`)).toBeVisible();
  });

  test("FR-12 c2: invalid date range preserves title and displays field error", async ({ page }) => {
    await signInAsAdmin(page);

    // Create a new project
    await page.goto("/projects/new");
    const code = `INV${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Invalid Dates Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page
      .getByRole("main")
      .getByRole("link", { name: `Invalid Dates Project ${code}` })
      .click();

    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Task with Bad Dates");
    await page.getByTestId("task-start-date-input").fill("2026-11-20");
    await page.getByTestId("task-due-date-input").fill("2026-11-05");

    await page.getByTestId("task-submit-button").click();

    // Error is shown and title is preserved
    await expect(page.getByText("Due date must be on or after start date")).toBeVisible();
    await expect(page.getByTestId("task-title-input")).toHaveValue("Task with Bad Dates");
  });

  test("FR-12 c3: non-member receives 404 Not Found", async ({ browser }) => {
    // Admin creates private project
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    await adminPage.goto("/projects/new");
    const code = `PRV${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await adminPage.getByLabel("Project Code").fill(code);
    await adminPage.getByLabel("Project Name").fill(`Private Project ${code}`);
    await adminPage.getByLabel("Start Date").fill("2026-11-01");
    await adminPage.getByLabel("End Date").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Create Project" }).click();

    await adminPage.waitForURL("**/projects");
    await adminPage.getByRole("link", { name: code, exact: true }).click();
    await adminPage.waitForURL("**/projects/**");
    const projectUrl = adminPage.url();
    await adminContext.close();

    // Create a regular member who is not added to this project
    const member = await createSignedInMember(browser, "MEMBER");
    await member.page.goto(projectUrl);
    await expect(member.page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await expect(member.page.getByText("The requested page could not be found.")).toBeVisible();

    await member.context.close();
  });
});
