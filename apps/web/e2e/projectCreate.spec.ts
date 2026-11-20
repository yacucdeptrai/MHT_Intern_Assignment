import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Project Creation & List (FR-07)", () => {
  test("FR-07 c1: Admin creates project, redirects to /projects, and sees project in table", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/projects");

    const newBtn = page.getByTestId("new-project-button");
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await page.waitForURL("**/projects/new");

    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `P-${uniqueId}`;
    const name = `Project Alpha ${uniqueId}`;

    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("input-name").fill(name);
    await page.getByTestId("input-description").fill("High priority initiative");
    await page.getByTestId("input-budget").fill("45000000");
    await page.getByTestId("input-start-date").fill("2026-11-01");
    await page.getByTestId("input-end-date").fill("2026-12-31");

    await page.getByTestId("submit-project-button").click();
    await page.waitForURL("**/projects");

    await expect(page.getByTestId(`project-row-${code}`)).toBeVisible();
    await expect(page.getByRole("main").getByText(name)).toBeVisible();
  });

  test("FR-07 c2: duplicate code shows 400 error 'Project code is already in use' and keeps input", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `D-${uniqueId}`;
    const name = `Duplicate Seed ${uniqueId}`;

    // Create the first project
    await page.goto("/projects/new");
    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("input-name").fill(name);
    await page.getByTestId("input-start-date").fill("2026-11-01");
    await page.getByTestId("input-end-date").fill("2026-12-31");
    await page.getByTestId("submit-project-button").click();
    await page.waitForURL("**/projects");

    // Try to create another project with the same code
    await page.goto("/projects/new");
    await page.getByTestId("input-code").fill(code.toLowerCase()); // test case-insensitivity
    await page.getByTestId("input-name").fill("Second Attempt Name");
    await page.getByTestId("input-start-date").fill("2026-11-01");
    await page.getByTestId("input-end-date").fill("2026-12-31");
    await page.getByTestId("submit-project-button").click();

    // Verify 400 error message
    const errorEl = page.getByTestId("error-code");
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText("Project code is already in use");

    // Verify input is retained
    await expect(page.getByTestId("input-name")).toHaveValue("Second Attempt Name");
  });

  test("FR-07 c3: end date before start date shows field error", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/projects/new");

    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `E-${uniqueId}`;

    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("input-name").fill("Invalid Date Project");
    await page.getByTestId("input-start-date").fill("2026-12-31");
    await page.getByTestId("input-end-date").fill("2026-11-01");
    await page.getByTestId("submit-project-button").click();

    const errorEl = page.getByTestId("error-end-date");
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText("End date must be on or after start date");
  });

  test("FR-07 c4: system MEMBER cannot access /projects/new (receives 403) and sees no '+ New Project' button", async ({
    browser,
  }) => {
    const member = await createSignedInMember(browser, "MEMBER");
    const page = member.page;

    await page.goto("/projects");
    await expect(page.getByTestId("new-project-button")).not.toBeVisible();

    const response = await page.goto("/projects/new");
    expect(response?.status()).toBe(403);
    await expect(page.getByText("You do not have permission to access this page")).toBeVisible();

    await member.context.close();
  });
});
