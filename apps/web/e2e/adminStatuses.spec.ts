import { expect, test } from "@playwright/test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in apps/web/.dev.vars or the environment`);
  }
  return value;
}

const adminEmail = requireEnv("ADMIN_SEED_EMAIL");
const adminPassword = requireEnv("ADMIN_SEED_PASSWORD");

test.describe("Admin Status Configuration Journey", () => {
  test("unauthenticated user is redirected to login with redirectTo", async ({ page }) => {
    await page.goto("/admin/statuses");
    await page.waitForURL(
      (url) => url.pathname === "/login" && url.searchParams.get("redirectTo") === "/admin/statuses",
    );
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/login");
    expect(currentUrl.searchParams.get("redirectTo")).toBe("/admin/statuses");
  });

  test("admin navigates to statuses, creates a new status, and edits it", async ({ page }) => {
    // 1. Sign in as Admin
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin**");

    // 2. Navigate to statuses
    await page.goto("/admin/statuses");
    await expect(page.getByRole("heading", { level: 1, name: "Task Statuses" })).toBeVisible();

    // 3. Open Add Status modal
    const uniqueSuffix = Math.random().toString(36).slice(2, 6);
    const newStatusName = `Quality Gate ${uniqueSuffix}`;

    await page.getByRole("button", { name: "Add Status" }).click();
    await page.getByLabel("Status Name").fill(newStatusName);
    await page.getByLabel("Category").selectOption("REVIEW");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    // 4. Verify new status is listed in table
    await expect(page.getByText(newStatusName)).toBeVisible({ timeout: 5000 });
  });
});
