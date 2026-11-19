import { expect, test } from "@playwright/test";

import { createSignedInMember, setupProjectWithTask } from "./helpers";

test.describe("Journey 7: Done Status Guard (FR-21)", () => {
  test("member posts a changeStatus with a Done status directly via page.request -> 403; task status is unchanged", async ({
    browser,
  }) => {
    const assignee = await createSignedInMember(browser, "MEMBER");
    const { taskUrl, doneStatusId } = await setupProjectWithTask(browser, {
      taskTitle: "Direct Done Guard Task",
      members: [{ user: assignee, projectRole: "MEMBER" }],
      assignToFullNames: [assignee.fullName],
    });

    await assignee.page.goto(taskUrl);
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("To Do");
    const currentVersion = (await assignee.page.getByTestId("display-task-version").textContent()) ?? "2";

    const response = await assignee.page.request.post(taskUrl, {
      form: {
        intent: "changeStatus",
        statusId: doneStatusId,
        version: currentVersion.trim(),
      },
    });
    expect(response.status()).toBe(403);

    // Verify task status remains unchanged
    await assignee.page.reload();
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("To Do");
    await expect(assignee.page.getByTestId("display-task-version")).toHaveText(currentVersion.trim());

    await assignee.context.close();
  });
});
