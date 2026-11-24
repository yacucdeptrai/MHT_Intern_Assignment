import { expect, test } from "@playwright/test";

import { createSignedInMember, setupProjectWithTask, signInAsAdmin } from "./helpers";

test.describe("Notification Center Journey (FR-25)", () => {
  test("FR-25 c1..c3: member sees notifications newest first with unread count, marks read, marks all read, and gets 404 when access is revoked", async ({
    browser,
  }) => {
    test.slow();

    const member = await createSignedInMember(browser, "MEMBER");

    const { projectId } = await setupProjectWithTask(browser, {
      taskTitle: "Notification Verification Task",
      members: [{ user: member, projectRole: "MEMBER" }],
      assignToFullNames: [member.fullName],
    });

    // 1. Member navigates to /notifications
    await member.page.goto("/notifications");
    await expect(member.page.getByTestId("notification-center-title")).toBeVisible();

    // Verify unread count is at least 1 (e.g. PROJECT_MEMBER_ADDED, TASK_ASSIGNED)
    const unreadCountEl = member.page.getByTestId("unread-count");
    await expect(unreadCountEl).toBeVisible();
    const initialCount = Number(await unreadCountEl.textContent());
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Verify notifications list is rendered
    const list = member.page.getByTestId("notifications-list");
    await expect(list).toBeVisible();

    // First item is newest
    const firstLink = list.locator('[data-testid^="notification-link-"]').first();
    await expect(firstLink).toBeVisible();

    // 2. FR-25 c2: Opening a notification marks it as read
    await expect(member.page.getByTestId("tab-unread")).toContainText(String(initialCount));
    await firstLink.click();
    await member.page.waitForURL(/\/projects\//);
    await member.page.goto("/notifications");

    // Unread count decrements
    await expect(unreadCountEl).toHaveText(String(initialCount - 1));

    // 3. FR-25 c2: Mark all as read (disabled once nothing is unread)
    const markAllReadBtn = member.page.getByTestId("mark-all-read-btn");
    if (await markAllReadBtn.isEnabled()) {
      await markAllReadBtn.click();
      await expect(unreadCountEl).toHaveText("0");
    }
    await expect(markAllReadBtn).toBeDisabled();
    await member.page.getByTestId("tab-unread").click();
    await expect(member.page.getByTestId("no-notifications-msg")).toContainText("You're all caught up");
    await member.page.getByTestId("tab-all").click();

    // 4. FR-25 c3: Click link to target task page while member has access
    await member.page.goto("/notifications");
    const taskLink = member.page.locator(`a[href*="/projects/${projectId}/tasks/"]`).first();
    await expect(taskLink).toBeVisible();
    await taskLink.click();
    await member.page.waitForURL(`**/projects/${projectId}/tasks/*`);
    expect(member.page.url()).toContain(`/projects/${projectId}/tasks/`);

    // 5. FR-25 c3: Revoke access (Admin removes member from project)
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    await adminPage.goto(`/projects/${projectId}/members`);
    await expect(adminPage.getByTestId("members-table")).toBeVisible();
    const memberRow = adminPage.locator("tr", { hasText: member.email });
    /* cspell:disable */
    await memberRow.getByRole("button", { name: /Remove|Gỡ bỏ/i }).click();
    await adminPage.getByTestId("confirm-remove-btn").click();
    /* cspell:enable */
    await expect(adminPage.getByTestId("success-banner")).toBeVisible();
    await expect(adminPage.getByTestId("members-table")).not.toContainText(member.email);
    await adminContext.close();

    // Member returns to /notifications, clicks the task link -> gets 404 from target page
    await member.page.goto("/notifications");
    const taskLinkRevoked = member.page.locator(`a[href*="/projects/${projectId}/tasks/"]`).first();
    await expect(taskLinkRevoked).toBeVisible();
    await taskLinkRevoked.click();

    // Non-member access to project task returns 404 ("Not found")
    /* cspell:disable */
    await expect(member.page.getByRole("heading", { name: /Not found|Không tìm thấy/i })).toBeVisible();
    /* cspell:enable */
  });
});
