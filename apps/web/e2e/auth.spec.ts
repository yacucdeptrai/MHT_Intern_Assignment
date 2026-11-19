/* cspell:disable */
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

test.describe("Authentication journey", () => {
  test("renders login page and form elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hệ thống Quản lý Dự án & Công việc");
    await expect(page.getByLabel("Địa chỉ email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();

    await page.getByTestId("lang-en").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Project & Task Management");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows generic error and preserves email on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/Email address|Địa chỉ email/i).fill("invalid.user@example.com");
    await page.getByLabel(/Password|Mật khẩu/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /Sign in|Đăng nhập/i }).click();

    await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect");
    await expect(page.getByLabel(/Email address|Địa chỉ email/i)).toHaveValue("invalid.user@example.com");
    await expect(page.getByLabel(/Password|Mật khẩu/i)).toHaveValue("");
  });

  test("logs in with seeded admin credentials and redirects to admin dashboard", async ({ page, context }) => {
    await page.goto("/login");

    await page.getByLabel(/Email address|Địa chỉ email/i).fill(adminEmail);
    await page.getByLabel(/Password|Mật khẩu/i).fill(adminPassword);
    await page.getByRole("button", { name: /Sign in|Đăng nhập/i }).click();

    await page.waitForURL("**/admin**");
    expect(page.url()).toContain("/admin");

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === "__session")).toBe(true);
  });

  test("logging out clears session cookie and returns to /login", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel(/Email address|Địa chỉ email/i).fill(adminEmail);
    await page.getByLabel(/Password|Mật khẩu/i).fill(adminPassword);
    await page.getByRole("button", { name: /Sign in|Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    const cookiesBefore = await context.cookies();
    expect(cookiesBefore.some((c) => c.name === "__session")).toBe(true);

    const logoutResponse = await page.request.post("/logout", { maxRedirects: 0 });
    expect(logoutResponse.status()).toBe(302);
    expect(logoutResponse.headers()["location"]).toBe("/login");
    expect(logoutResponse.headers()["set-cookie"]).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });
});
