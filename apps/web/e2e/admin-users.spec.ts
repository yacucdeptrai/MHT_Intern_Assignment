/* cspell:disable */
import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Journey 2: Admin User Management (FR-03, FR-04)", () => {
  test("unauthenticated user is redirected to login with redirectTo (Lesson #8)", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("redirectTo") === "/admin/users");
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe("/login");
    expect(currentUrl.searchParams.get("redirectTo")).toBe("/admin/users");
  });

  test("admin creates a user; tries a duplicate email; locks a user who is signed in elsewhere", async ({
    browser,
    page,
  }) => {
    // 1. Login as Admin
    await signInAsAdmin(page);

    // 2. Open User Management
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: /^(Users|Người dùng)$/ })).toBeVisible();

    // 3. Open Create User Modal
    const createButton = page.getByTestId("btn-open-create-user");
    const modalHeading = page.getByRole("heading", { level: 2, name: /^(Create user|Tạo người dùng)$/i });
    await expect(async () => {
      await createButton.click();
      await expect(modalHeading).toBeVisible({ timeout: 1000 });
    }).toPass({ intervals: [500], timeout: 10000 });

    const uniqueId = Math.random().toString(36).slice(2, 7);
    const testEmail = `intern.${uniqueId}@example.com`;
    const testName = `Intern Engineer ${uniqueId}`;

    await page.getByLabel(/Full Name|Họ và tên/i).fill(testName);
    await page.getByLabel(/Email Address|Địa chỉ email/i).fill(testEmail);
    await page.getByLabel(/^(Department|Phòng ban)$/i).fill("Platform");
    await page.getByTestId("btn-submit-create-user").click();

    // 4. Verify Success & Invite Link
    await expect(page.getByText(/User account created|Đã tạo tài khoản người dùng/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy Link|Sao chép liên kết/i })).toBeVisible();

    // 5. Verify user appears in table
    await expect(page.getByText(testName)).toBeVisible();
    await expect(page.getByText(testEmail)).toBeVisible();

    // 6. Duplicate email test: try creating another user with the exact same email
    await createButton.click();
    await expect(modalHeading).toBeVisible();

    const dupName = `Duplicate Attempt ${uniqueId}`;
    await page.getByLabel(/Full Name|Họ và tên/i).fill(dupName);
    await page.getByLabel(/Email Address|Địa chỉ email/i).fill(testEmail);
    await page.getByLabel(/^(Department|Phòng ban)$/i).fill("DevOps");
    await page.getByTestId("btn-submit-create-user").click();

    // Duplicate shows field error AND keeps the form values (Lesson #14)
    await expect(page.getByTestId("error-create-email")).toContainText(
      /Email is already in use|Email đã được sử dụng/i,
    );
    await expect(page.getByLabel(/Full Name|Họ và tên/i)).toHaveValue(dupName);
    await expect(page.getByLabel(/Email Address|Địa chỉ email/i)).toHaveValue(testEmail);
    await expect(page.getByLabel(/^(Department|Phòng ban)$/i)).toHaveValue("DevOps");

    // Close the modal
    await page.getByRole("button", { name: /Cancel|Hủy/i }).click();
    await expect(modalHeading).not.toBeVisible();

    // 7. Lock a user who is signed in elsewhere -> locked user is signed out on next navigation
    const member = await createSignedInMember(browser, "MEMBER");

    // Member verifies active session
    await member.page.goto("/my-tasks");
    await expect(member.page.getByRole("heading", { level: 1 })).toBeVisible();

    // Admin finds member in table and locks them
    await page.goto("/admin/users");
    const memberRow = page.locator("tr", { hasText: member.email });
    // Lock / Unlock live in the row actions menu
    await memberRow.getByRole("button", { name: /User actions|Thao tác người dùng/i }).click();
    await page.getByRole("menuitem", { name: /^(Lock|Khóa)$/i }).click();
    await expect(memberRow.getByTestId(/^user-status-/)).toHaveText(/Locked|Đã khóa/i);
    await memberRow.getByRole("button", { name: /User actions|Thao tác người dùng/i }).click();
    await expect(page.getByRole("menuitem", { name: /^(Unlock|Mở khóa)$/i })).toBeVisible();
    await page.keyboard.press("Escape");

    // Member navigates to another page
    await member.page.goto("/profile");

    // Member is signed out and redirected to /login
    await member.page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(member.page.url()).pathname).toBe("/login");

    await member.context.close();
  });
});
