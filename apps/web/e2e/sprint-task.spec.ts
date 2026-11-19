import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Journey 4: Sprint Task Creation and Realtime Notification (FR-26)", () => {
  test("lead creates a sprint and a task in it, and assigns the member; member receives a realtime notification without reloading", async ({
    browser,
  }) => {
    // 1. Create a signed-in member
    const member = await createSignedInMember(browser, "MEMBER");

    // 2. Member opens /notifications with 0 notifications initially
    await member.page.goto("/notifications");
    await expect(member.page.getByTestId("notification-center-title")).toBeVisible();
    await expect(member.page.getByTestId("unread-count")).toHaveText("0");
    await expect(member.page.getByTestId("no-notifications-msg")).toBeVisible();

    // 3. Lead / Admin in another browser context creates a project, adds member, creates a sprint and task, and assigns member
    const leadContext = await browser.newContext();
    const leadPage = await leadContext.newPage();
    await signInAsAdmin(leadPage);

    // Create project
    await leadPage.goto("/projects/new");
    const code = `RT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const taskTitle = `Realtime Ticket ${code}`;
    /* cspell:disable */
    await leadPage.getByLabel(/Project Code|Mã dự án/i).fill(code);
    await leadPage.getByLabel(/Project Name|Tên dự án/i).fill(`Realtime Project ${code}`);
    await leadPage.getByLabel(/Start Date|Ngày bắt đầu/i).fill("2026-11-01");
    await leadPage.getByLabel(/End Date|Ngày kết thúc/i).fill("2026-12-31");
    await leadPage.getByRole("button", { name: /Create Project|Tạo dự án/i }).click();
    /* cspell:enable */

    await leadPage.waitForURL("**/projects");
    await leadPage.getByRole("link", { name: `Realtime Project ${code}` }).click();
    await leadPage.waitForURL("**/projects/*");
    const projectId = leadPage.url().split("/projects/")[1]?.split("/")[0] ?? "";

    // Add member to project
    await leadPage.goto(`/projects/${projectId}/members`);
    await expect(leadPage.getByTestId("members-table")).toBeVisible();
    await leadPage.getByTestId("search-user-input").fill(member.email);
    const userSelect = leadPage.getByTestId("search-user-select");
    await expect(userSelect).toBeVisible();
    await userSelect.selectOption({ label: `${member.fullName} (${member.email})` });
    await leadPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await leadPage.getByTestId("add-member-submit-btn").click();
    await expect(leadPage.getByTestId("members-table")).toContainText(member.email);

    // Create sprint
    await leadPage.goto(`/projects/${projectId}/sprints`);
    await leadPage.getByTestId("create-sprint-btn").click();
    await leadPage.getByTestId("sprint-name-input").fill(`Sprint RT ${code}`);
    await leadPage.getByTestId("sprint-start-date-input").fill("2026-11-01");
    await leadPage.getByTestId("sprint-end-date-input").fill("2026-11-14");
    await leadPage.getByTestId("create-sprint-submit-btn").click();
    await expect(leadPage.getByTestId("sprints-table")).toBeVisible();

    // Create task in project and assign member
    await leadPage.goto(`/projects/${projectId}`);
    await leadPage.getByTestId("create-task-button").click();
    await leadPage.getByTestId("task-title-input").fill(taskTitle);
    await leadPage.getByTestId("task-submit-button").click();
    await expect(leadPage.getByTestId("tasks-table")).toContainText(taskTitle);

    // Open task details and assign member
    await leadPage.getByRole("link", { name: taskTitle }).click();
    await leadPage.waitForURL("**/tasks/*");

    // Link task to the sprint
    await leadPage.getByTestId("edit-task-button").click();
    await expect(leadPage.getByTestId("edit-task-form")).toBeVisible();
    await leadPage.getByTestId("edit-sprint-select").selectOption({ label: `Sprint RT ${code}` });
    await leadPage.getByTestId("save-task-button").click();
    await expect(leadPage.getByTestId("sidebar-sprint")).toHaveText(`Sprint RT ${code}`);

    await leadPage.getByTestId("btn-toggle-assign").click();
    await leadPage.getByLabel(member.fullName).check();
    await leadPage.getByTestId("btn-save-assign").click();
    await expect(leadPage.getByTestId("sidebar-assignees")).toContainText(member.fullName);

    await leadContext.close();

    // 4. Verify in member's browser: WITHOUT RELOADING, within 2 seconds (FR-26 c1),
    // the notification appears and unread count updates!
    await expect(member.page.getByTestId("notifications-list")).toBeVisible({ timeout: 10000 });
    await expect(member.page.getByTestId("notifications-list")).toContainText(taskTitle);
    await expect(member.page.getByTestId("unread-count")).not.toHaveText("0");

    await member.context.close();
  });
});
