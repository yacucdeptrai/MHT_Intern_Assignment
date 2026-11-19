/* cspell:disable */
import { expect, test } from "@playwright/test";

import { createSignedInMember, setupProjectWithTask } from "./helpers";

test.describe("Journey 6: Project and Task Access Control (FR-16)", () => {
  test("a user who is not a member opens the project URL and a task URL; both show the Not found page (404)", async ({
    browser,
  }) => {
    // 1. Create a project with a task and an assigned member
    const assignee = await createSignedInMember(browser, "MEMBER");
    const taskTitle = `Secret Task ${Math.random().toString(36).slice(2, 6)}`;
    const { projectId, taskUrl } = await setupProjectWithTask(browser, {
      taskTitle,
      members: [{ user: assignee, projectRole: "MEMBER" }],
      assignToFullNames: [assignee.fullName],
    });

    const projectUrl = `/projects/${projectId}`;

    // 2. Create another user who is NOT a member of the project
    const nonMember = await createSignedInMember(browser, "MEMBER");

    // 3. Non-member opens the project URL -> 404 Not Found page
    await nonMember.page.goto(projectUrl);
    await expect(nonMember.page.getByRole("heading", { name: /Not found|Không tìm thấy/i })).toBeVisible();
    await expect(
      nonMember.page.getByText(/The requested page could not be found|Trang bạn yêu cầu không tồn tại/i),
    ).toBeVisible();
    await expect(nonMember.page.getByTestId("project-header")).not.toBeVisible();

    // 4. Non-member opens the task URL -> 404 Not Found page
    await nonMember.page.goto(taskUrl);
    await expect(nonMember.page.getByRole("heading", { name: /Not found|Không tìm thấy/i })).toBeVisible();
    await expect(
      nonMember.page.getByText(/The requested page could not be found|Trang bạn yêu cầu không tồn tại/i),
    ).toBeVisible();
    await expect(nonMember.page.getByTestId("task-title-input")).not.toBeVisible();
    await expect(nonMember.page.getByText(taskTitle)).not.toBeVisible();

    await assignee.context.close();
    await nonMember.context.close();
  });
});
