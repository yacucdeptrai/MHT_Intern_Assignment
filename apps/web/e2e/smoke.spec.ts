/* cspell:disable */
import { expect, test } from "@playwright/test";

test("home page renders the application title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Project & Task Management");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Project & Task Management|Hệ thống Quản lý Dự án & Công việc/,
  );
});

test("unknown paths render the not found page with status 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not found");
});
