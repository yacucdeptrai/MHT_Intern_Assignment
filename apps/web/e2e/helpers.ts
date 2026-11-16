import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in apps/web/.dev.vars or the environment`);
  }
  return value;
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(requireEnv("ADMIN_SEED_EMAIL"));
  await page.getByLabel("Password").fill(requireEnv("ADMIN_SEED_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin**");
}

export interface TestUser {
  email: string;
  fullName: string;
  password: string;
  context: BrowserContext;
  page: Page;
}

/**
 * Creates a dedicated MEMBER through the admin invite flow and signs them in, so a journey that
 * changes account data never touches the shared seeded admin.
 */
export async function createSignedInMember(
  browser: Browser,
  role: "MEMBER" | "PM" | "TEAM_LEAD" = "MEMBER",
): Promise<TestUser> {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAsAdmin(adminPage);
  await adminPage.goto("/admin/users");

  const createButton = adminPage.getByRole("button", { name: "+ Create User" });
  const modalHeading = adminPage.getByRole("heading", { level: 2, name: "Create New User" });
  await expect(async () => {
    await createButton.click();
    await expect(modalHeading).toBeVisible({ timeout: 1000 });
  }).toPass({ intervals: [500], timeout: 10000 });

  const uniqueId = Math.random().toString(36).slice(2, 8);
  const email = `profile.${uniqueId}@example.com`;
  const fullName = `Profile User ${uniqueId}`;
  await adminPage.getByLabel("Full Name").fill(fullName);
  await adminPage.getByLabel("Email Address").fill(email);
  if (role !== "MEMBER") {
    await adminPage.locator("#create-systemRole").selectOption(role);
  }
  await adminPage.getByRole("button", { name: "Create User", exact: true }).click();

  await expect(adminPage.getByText("User account created successfully!")).toBeVisible();
  const inviteUrl = await adminPage.locator("input[readonly]").inputValue();
  await adminContext.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const password = `InitialPw!${uniqueId}`;
  await page.goto(new URL(inviteUrl).pathname);
  await page.getByLabel("New Password").fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Set Password and Sign In" }).click();
  await page.waitForURL(role === "PM" ? "**/admin**" : "**/");

  return { email, fullName, password, context, page };
}
