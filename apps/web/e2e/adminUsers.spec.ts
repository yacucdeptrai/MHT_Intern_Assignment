import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Admin User Management Journey", () => {
  test("unauthenticated user is redirected to login with redirectTo", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("redirectTo") === "/admin/users");
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/login");
    expect(currentUrl.searchParams.get("redirectTo")).toBe("/admin/users");
  });

  test("admin logs in, navigates to user management, and creates a new user", async ({ page }) => {
    // 1. Login as Admin
    await signInAsAdmin(page);

    // 2. Open User Management
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "User Management" })).toHaveText("User Management");

    // 3. Open Create User Modal
    const createButton = page.getByRole("button", { name: "+ Create User" });
    const modalHeading = page.getByRole("heading", { level: 2, name: "Create New User" });
    await expect(async () => {
      await createButton.click();
      await expect(modalHeading).toBeVisible({ timeout: 1000 });
    }).toPass({ intervals: [500], timeout: 10000 });

    const uniqueId = Math.random().toString(36).slice(2, 7);
    const testEmail = `intern.${uniqueId}@example.com`;
    const testName = `Intern Engineer ${uniqueId}`;

    await page.getByLabel("Full Name").fill(testName);
    await page.getByLabel("Email Address").fill(testEmail);
    await page.getByLabel("Department (Optional)").fill("Platform");
    await page.getByRole("button", { name: "Create User", exact: true }).click();

    // 4. Verify Success & Invite Link
    await expect(page.getByText("User account created successfully!")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();

    // 5. Verify user appears in table
    await expect(page.getByText(testName)).toBeVisible();
    await expect(page.getByText(testEmail)).toBeVisible();
  });
});
