import { expect, test } from "@playwright/test";

test.describe("SSO Login journey (FR-02)", () => {
  test("FR-02 c4: providers not configured do not show buttons on login page", async ({ page }) => {
    await page.goto("/login");

    // Microsoft is not configured in local/CI env (placeholder replace-with-...)
    // Its button must be hidden
    await expect(page.getByTestId("sso-microsoft")).toHaveCount(0);
  });

  test("FR-02 c2: displays clear alert when no account exists for SSO email", async ({ page }) => {
    await page.goto("/login?error=no_account");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("No account exists for this email. Ask an administrator for an invite.");
  });

  test("FR-02 c3: displays clear alert when SSO account is locked", async ({ page }) => {
    await page.goto("/login?error=locked");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("This account is locked. Contact an administrator.");
  });

  test("displays generic failure alert when OAuth authentication fails", async ({ page }) => {
    await page.goto("/login?error=failed");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("Authentication failed. Please try again.");
  });

  test("returns 404 for unknown or not configured OAuth start endpoints", async ({ page }) => {
    const unknownRes = await page.goto("/auth/unsupported-provider");
    expect(unknownRes?.status()).toBe(404);

    const msRes = await page.goto("/auth/microsoft");
    expect(msRes?.status()).toBe(404);
  });
});
