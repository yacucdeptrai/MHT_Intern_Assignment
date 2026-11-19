import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Invite & Password Setup Journey (FR-37)", () => {
  test("full flow: admin invites user -> user sets password -> user signs in -> invite link is invalidated", async ({
    browser,
    page,
  }) => {
    // 1. Admin logs in and visits /admin/users
    await signInAsAdmin(page);

    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "User Management" })).toBeVisible();

    // 2. Open Create User Modal
    const createButton = page.getByRole("button", { name: "+ Create User" });
    const modalHeading = page.getByRole("heading", { level: 2, name: "Create New User" });
    await expect(async () => {
      await createButton.click();
      await expect(modalHeading).toBeVisible({ timeout: 1000 });
    }).toPass({ intervals: [500], timeout: 10000 });

    const uniqueId = Math.random().toString(36).slice(2, 7);
    const testEmail = `invited.${uniqueId}@example.com`;
    const testName = `Invited User ${uniqueId}`;

    await page.getByLabel("Full Name").fill(testName);
    await page.getByLabel("Email Address").fill(testEmail);
    await page.getByRole("button", { name: "Create User", exact: true }).click();

    // 3. Extract invite link
    await expect(page.getByText("User account created successfully!")).toBeVisible();
    const inviteInput = page.locator("input[readonly]");
    await expect(inviteInput).toBeVisible();
    const inviteUrl = await inviteInput.inputValue();
    expect(inviteUrl).toContain("/invite/");

    // 4. In a separate unauthenticated browser context, open the invite URL
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const invitePath = new URL(inviteUrl).pathname;

    await userPage.goto(invitePath);
    await expect(userPage.getByRole("heading", { level: 1, name: "Accept Invitation" })).toBeVisible();
    await expect(userPage.getByText(testEmail)).toBeVisible();

    // 5. Test validation: password mismatch
    await userPage.getByLabel("New Password").fill("Password123!");
    await userPage.getByLabel("Confirm Password").fill("Mismatch123!");
    await userPage.getByRole("button", { name: "Set Password and Sign In" }).click();
    await expect(userPage.getByText("Passwords do not match")).toBeVisible();

    // 6. Test success: submit matching valid password (>=10 chars)
    const validPassword = "SecurePassword123!";
    await userPage.getByLabel("New Password").fill(validPassword);
    await userPage.getByLabel("Confirm Password").fill(validPassword);
    await userPage.getByRole("button", { name: "Set Password and Sign In" }).click();

    // 7. User lands on member dashboard and sees their name/email
    await userPage.waitForURL("**/");
    await expect(userPage.getByRole("heading", { level: 1, name: "Project & Task Management" })).toBeVisible();
    await expect(userPage.getByText(`Welcome back, ${testName}`)).toBeVisible();

    // 8. Re-opening the invite link shows invalid / expired error
    await userPage.goto(invitePath);
    await expect(
      userPage.getByRole("heading", { level: 1, name: "This invite is invalid or has expired" }),
    ).toBeVisible();

    await userContext.close();
  });
});
