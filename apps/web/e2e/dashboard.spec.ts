import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Dashboard (FR-33, FR-34)", () => {
  test("admin portal dashboard shows the stat cards, projects at risk and personal panels", async ({ page }) => {
    await signInAsAdmin(page);
    await page.waitForURL("**/admin");

    const dashboard = page.getByTestId("admin-dashboard");
    await expect(dashboard.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(dashboard.getByText("Admin & PM portal")).toBeVisible();
    for (const stat of ["stat-in-progress", "stat-review", "stat-priorities", "stat-overdue"]) {
      await expect(page.getByTestId(stat)).toBeVisible();
    }
    await expect(page.getByTestId("projects-at-risk-section")).toContainText("Projects at risk");
    await expect(page.getByTestId("projects-at-risk-section")).toContainText("(organization-wide)");
    await expect(page.getByTestId("overdue-widget")).toContainText("Overdue tasks");
    await expect(page.getByTestId("today-priorities-section")).toContainText("Today's priorities");
    await expect(page.getByTestId("in-progress-section")).toContainText("In progress");
  });

  test("a new member sees zero counts and the empty state lines", async ({ browser }) => {
    // Creating the member goes through the admin invite flow first.
    test.setTimeout(60_000);
    const member = await createSignedInMember(browser);
    try {
      const { page } = member;
      await page.goto("/");
      const dashboard = page.getByTestId("personal-dashboard");
      await expect(dashboard.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      await expect(page.getByTestId("projects-at-risk-section")).toHaveCount(0);
      await expect(page.getByTestId("stat-overdue-value")).toHaveText("0");
      await expect(page.getByTestId("stat-overdue")).toContainText("Nothing overdue");
      await expect(page.getByTestId("overdue-widget")).toContainText("No overdue tasks. Nice.");
      await expect(page.getByTestId("today-priorities-section")).toContainText("No priority tasks for today.");
      await expect(page.getByTestId("in-progress-section")).toContainText("No tasks currently in progress.");
      await expect(page.getByTestId("unread-notifications-indicator")).toBeVisible();
    } finally {
      await member.context.close();
    }
  });

  test("overdue and priority panels sit side by side at 1440px and stack at 1024px", async ({ page }) => {
    await signInAsAdmin(page);
    await page.waitForURL("**/admin");
    const first = page.getByTestId("overdue-widget");
    const third = page.getByTestId("today-priorities-section");

    await page.setViewportSize({ width: 1440, height: 900 });
    const wideFirst = await first.boundingBox();
    const wideThird = await third.boundingBox();
    expect(wideFirst?.y).toBe(wideThird?.y);

    await page.setViewportSize({ width: 1024, height: 768 });
    const narrowFirst = await first.boundingBox();
    const narrowThird = await third.boundingBox();
    expect(narrowThird?.y ?? 0).toBeGreaterThan(narrowFirst?.y ?? 0);
  });
});
