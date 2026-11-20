import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Calendar (FR-35)", () => {
  test("switches day / week / month, steps through dates and keeps the choice in the URL", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/calendar?view=month&date=2026-11-19");

    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await expect(page.getByTestId("calendar-month-view")).toBeVisible();
    await expect(page.getByTestId("calendar-week-row")).toHaveCount(6);
    await expect(page.getByTestId("calendar-heading")).toHaveText("Nov 2026");
    await expect(page.getByTestId("calendar-legend")).toContainText("To do");
    await expect(page.getByTestId("calendar-legend")).toContainText("Review");

    await page.getByTestId("calendar-nav").getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/date=2026-12-01/);
    await expect(page.getByTestId("calendar-heading")).toHaveText("Dec 2026");

    await page.getByTestId("calendar-view-week").click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByTestId("calendar-week-view")).toBeVisible();
    await expect(page.getByTestId("calendar-week-row")).toHaveCount(1);

    await page.goto("/calendar?view=day&date=2030-01-02");
    await expect(page.getByTestId("calendar-day-view")).toContainText("Scheduled items (0)");
    await expect(page.getByTestId("calendar-day-view")).toContainText("No tasks scheduled for this day.");
  });

  test("project filter is applied through the URL", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/calendar");
    const select = page.getByTestId("calendar-project-filter").getByRole("combobox");
    const options = await select.locator("option").allTextContents();
    test.skip(options.length < 2, "No projects to filter by");
    await select.selectOption({ index: 1 });
    await expect(page).toHaveURL(/projectId=/);
    await select.selectOption({ index: 0 });
    await expect(page).not.toHaveURL(/projectId=/);
  });
});
