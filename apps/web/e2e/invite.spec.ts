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
    await userContext.addCookies([
      {
        name: "lang",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    const userPage = await userContext.newPage();
    const invitePath = new URL(inviteUrl).pathname;

    /* cspell:disable */
    await userPage.goto(invitePath);
    await expect(
      userPage.getByRole("heading", { level: 1, name: /Accept Invitation|Chấp nhận lời mời/i }),
    ).toBeVisible();
    await expect(userPage.getByText(testEmail)).toBeVisible();

    // 5. Test validation: the expiry note shows, and short or mismatched passwords keep submit disabled
    const submitButton = userPage.getByRole("button", { name: /Set Password and Sign In|Đặt mật khẩu và Đăng nhập/i });
    await expect(userPage.getByTestId("invite-expiry")).toContainText(/can be used once|chỉ dùng được một lần/);
    await expect(submitButton).toBeDisabled();
    await userPage.getByLabel(/New Password|Mật khẩu mới/i).fill("short");
    await expect(userPage.getByText("Password must be at least 10 characters")).toBeVisible();
    await expect(submitButton).toBeDisabled();
    await userPage.getByLabel(/New Password|Mật khẩu mới/i).fill("Password123!");
    await userPage.getByLabel(/Confirm Password|Xác nhận mật khẩu/i).fill("Mismatch123!");
    await expect(userPage.getByText("Passwords do not match")).toBeVisible();
    await expect(submitButton).toBeDisabled();

    // 6. Test success: submit matching valid password (>=10 chars)
    const validPassword = "SecurePassword123!";
    await userPage.getByLabel(/New Password|Mật khẩu mới/i).fill(validPassword);
    await userPage.getByLabel(/Confirm Password|Xác nhận mật khẩu/i).fill(validPassword);
    await userPage.getByRole("button", { name: /Set Password and Sign In|Đặt mật khẩu và Đăng nhập/i }).click();

    // 7. User lands on member dashboard and sees their name/email
    await userPage.waitForURL("**/");
    await expect(
      userPage.getByRole("heading", {
        level: 1,
        name: /Project & Task Management|Hệ thống Quản lý Dự án & Công việc/i,
      }),
    ).toBeVisible();
    await expect(userPage.getByText(new RegExp(`(Welcome back|Chào mừng trở lại), ${testName}`))).toBeVisible();

    // 8. Re-opening the invite link shows invalid / expired error
    await userPage.goto(invitePath);
    await expect(
      userPage.getByRole("heading", {
        level: 1,
        name: /This invite is invalid or has expired|Lời mời không hợp lệ hoặc đã hết hạn/i,
      }),
    ).toBeVisible();
    /* cspell:enable */

    await userContext.close();
  });
});
