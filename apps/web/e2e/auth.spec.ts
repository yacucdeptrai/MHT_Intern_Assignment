import { expect, test } from "@playwright/test";

test.describe("Authentication journey", () => {
  test("renders login page and form elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Project & Task Management");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows generic error and preserves email on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email address").fill("invalid.user@example.com");
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect");
    await expect(page.getByLabel("Email address")).toHaveValue("invalid.user@example.com");
  });

  test("logs in with seeded admin credentials and redirects to admin dashboard", async ({ page, context }) => {
    await page.goto("/login");

    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("admin-password-change-me-immediately");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/admin**");
    expect(page.url()).toContain("/admin");

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === "__session")).toBe(true);
  });

  test("logging out clears session cookie and returns to /login", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("admin@example.com");
    await page.getByLabel("Password").fill("admin-password-change-me-immediately");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin**");

    const cookiesBefore = await context.cookies();
    expect(cookiesBefore.some((c) => c.name === "__session")).toBe(true);

    const logoutResponse = await page.request.post("/logout");
    expect(logoutResponse.headers()["set-cookie"]).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });
});
