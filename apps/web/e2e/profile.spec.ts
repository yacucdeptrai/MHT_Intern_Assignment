import { expect, test } from "@playwright/test";

import { createSignedInMember } from "./helpers";

test.describe("User Profile Journey (FR-05, FR-06)", () => {
  test("FR-05 c1, c2 & FR-06 c1, c2: user views profile, updates contact details, changes password, and uploads avatar", async ({
    browser,
  }) => {
    // 1. A dedicated member, so the password change never touches the shared seeded admin
    const user = await createSignedInMember(browser);
    const { page } = user;

    try {
      // 2. Open /profile
      await page.goto("/profile");
      await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();

      // Verify readonly fields (FR-06 c4)
      await expect(page.getByTestId("profile-email-readonly")).toBeDisabled();
      await expect(page.getByTestId("profile-department-readonly")).toBeDisabled();
      await expect(page.getByTestId("profile-role-readonly")).toBeDisabled();

      // 3. Update Contact Details
      const uniquePhone = `+849${Math.floor(10000000 + Math.random() * 90000000)}`;
      await page.getByTestId("profile-phone-input").fill(uniquePhone);
      await page.getByTestId("profile-save-button").click();
      await expect(page.getByRole("status")).toContainText("Profile updated successfully");
      await expect(page.getByTestId("profile-phone-input")).toHaveValue(uniquePhone);

      // 4. Change Password (FR-06 c2)
      const newPassword = `NewSecretPw!${Math.random().toString(36).slice(2, 8)}`;

      // Try incorrect current password first
      await page.getByTestId("current-password-input").fill("WrongCurrentPassword!");
      await page.getByTestId("new-password-input").fill(newPassword);
      await page.getByTestId("confirm-password-input").fill(newPassword);
      await page.getByTestId("change-password-button").click();
      await expect(page.getByText("Current password is incorrect")).toBeVisible();

      // Now use correct current password
      await page.getByTestId("current-password-input").fill(user.password);
      await page.getByTestId("new-password-input").fill(newPassword);
      await page.getByTestId("confirm-password-input").fill(newPassword);
      await page.getByTestId("change-password-button").click();
      await expect(page.getByRole("status")).toContainText("Password updated successfully");

      // 5. Verify sign-in with new password
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL("**/login**");

      /* cspell:disable */
      await page.getByLabel(/Email address|Địa chỉ email/i).fill(user.email);
      await page.getByLabel(/Password|Mật khẩu/i).fill(newPassword);
      await page.getByRole("button", { name: /Sign in|Đăng nhập/i }).click();
      /* cspell:enable */
      await page.waitForURL("**/");

      // 6. Avatar Upload (FR-06 c1)
      await page.goto("/profile");
      const fakePng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      await page.getByTestId("avatar-file-input").setInputFiles({
        name: "avatar.png",
        mimeType: "image/png",
        buffer: fakePng,
      });
      await page.getByTestId("avatar-upload-button").click();

      // Verify avatar element is visible and loaded
      await expect(page.getByTestId("avatar-image")).toBeVisible();

      // 7. Verify no route exists for another user's profile (FR-05 c2)
      const otherProfileResponse = await page.goto("/profile/another-user-1234");
      expect(otherProfileResponse?.status()).toBe(404);
    } finally {
      await user.context.close();
    }
  });
});
