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

test.describe("Layout Separation and Route Guards", () => {
  test("unauthenticated access to / redirects to /login with redirectTo=/", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("redirectTo") === "/");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to /admin redirects to /login with redirectTo=/admin", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("redirectTo") === "/admin");
    expect(page.url()).toContain("/login");
  });

  test("admin logs in and sees AdminShell on /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/admin");
    const adminShell = page.locator("[data-testid='admin-shell']");
    await expect(adminShell).toBeVisible();
    await expect(page.getByText("Admin & PM Portal")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeVisible();
  });

  test("admin navigating to / is automatically redirected to /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin");

    // Attempt to navigate to /
    await page.goto("/");
    await page.waitForURL("**/admin");
    expect(page.url()).toContain("/admin");
  });

  test("admin navigates to user management through AdminShell link", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin");

    await page.getByRole("link", { name: "User Management" }).click();
    await page.waitForURL("**/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "User Management" })).toBeVisible();
    await expect(page.locator("[data-testid='admin-shell']")).toBeVisible();
  });
});
