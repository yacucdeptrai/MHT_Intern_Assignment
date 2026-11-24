import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

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
    await signInAsAdmin(page);

    await page.waitForURL("**/admin");
    const adminShell = page.locator("[data-testid='admin-shell']");
    await expect(adminShell).toBeVisible();
    await expect(page.getByTestId("workspace-subtitle")).toHaveText("Admin & PM portal");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });

  test("admin navigating to / is automatically redirected to /admin", async ({ page }) => {
    await signInAsAdmin(page);

    // Attempt to navigate to /
    await page.goto("/");
    await page.waitForURL("**/admin");
    expect(page.url()).toContain("/admin");
  });

  test("admin navigates to user management through AdminShell link", async ({ page }) => {
    await signInAsAdmin(page);

    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.waitForURL("**/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "Users", exact: true })).toBeVisible();
    await expect(page.locator("[data-testid='admin-shell']")).toBeVisible();
  });
});
