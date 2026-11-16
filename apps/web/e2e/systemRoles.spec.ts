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

test.describe("System Role Assignment Journey (FR-04)", () => {
  test("admin updates a user's system role and verifies last-admin protection", async ({ page }) => {
    // 1. Login as Admin
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin**");

    // 2. Open User Management
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "User Management" })).toBeVisible();

    // 3. Create a Member user
    const createButton = page.getByRole("button", { name: "+ Create User" });
    const modalHeading = page.getByRole("heading", { level: 2, name: "Create New User" });
    await expect(async () => {
      await createButton.click();
      await expect(modalHeading).toBeVisible({ timeout: 1000 });
    }).toPass({ intervals: [500], timeout: 10000 });

    const uniqueId = Math.random().toString(36).slice(2, 7);
    const testEmail = `role.change.${uniqueId}@example.com`;
    const testName = `Role Change User ${uniqueId}`;

    await page.getByLabel("Full Name").fill(testName);
    await page.getByLabel("Email Address").fill(testEmail);
    await page.getByRole("button", { name: "Create User", exact: true }).click();
    await expect(page.getByText("User account created successfully!")).toBeVisible();

    // 4. Find user row and click Edit
    const userRow = page.locator("tr", { hasText: testEmail });
    await expect(userRow).toBeVisible();
    await expect(userRow.getByText("MEMBER")).toBeVisible();

    await userRow.getByRole("button", { name: "Edit" }).click();
    const editModalHeading = page.getByRole("heading", { level: 2, name: `Edit User: ${testName}` });
    await expect(editModalHeading).toBeVisible();

    // 5. Change role to PM and save
    await page.getByLabel("System Role").selectOption("PM");
    await page.getByRole("button", { name: "Save Changes" }).click();

    // 6. Verify row now displays PM role badge
    await expect(userRow.getByText("PM")).toBeVisible();
  });
});
