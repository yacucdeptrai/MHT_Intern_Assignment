import { expect, test } from "@playwright/test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in apps/web/.dev.vars or the environment`);
  }
  return value;
}

const adminEmail = requireEnv("ADMIN_SEED_EMAIL");
const initialAdminPassword = requireEnv("ADMIN_SEED_PASSWORD");

test.describe("User Profile Journey (FR-05, FR-06)", () => {
  test("user views profile, updates contact details, changes password, and uploads avatar", async ({ page }) => {
    // 1. Sign in
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(initialAdminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin**");

    // 2. Open /profile
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "User Profile" })).toBeVisible();

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
    await page.getByTestId("current-password-input").fill(initialAdminPassword);
    await page.getByTestId("new-password-input").fill(newPassword);
    await page.getByTestId("confirm-password-input").fill(newPassword);
    await page.getByTestId("change-password-button").click();
    await expect(page.getByRole("status")).toContainText("Password updated successfully");

    // 5. Verify sign-in with new password
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login**");

    await page.getByLabel("Email address").fill(adminEmail);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/admin**");

    // 6. Reset password back to initialAdminPassword to leave test state clean
    await page.goto("/profile");
    await page.getByTestId("current-password-input").fill(newPassword);
    await page.getByTestId("new-password-input").fill(initialAdminPassword);
    await page.getByTestId("confirm-password-input").fill(initialAdminPassword);
    await page.getByTestId("change-password-button").click();
    await expect(page.getByRole("status")).toContainText("Password updated successfully");

    // 7. Avatar Upload (FR-06 c1)
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

    // 8. Verify no route exists for another user's profile (FR-05 c2)
    const otherProfileResponse = await page.goto("/profile/another-user-1234");
    expect(otherProfileResponse?.status()).toBe(404);
  });
});
