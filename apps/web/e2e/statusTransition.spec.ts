import { expect, test } from "@playwright/test";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask } from "./helpers";

test.describe("Task Status Transition Journey (FR-21)", () => {
  test("FR-21 c1, c4: assignee moves task To Do -> In Progress -> Review; non-editor member has no status form", async ({
    browser,
  }) => {
    const assignee = await createSignedInMember(browser, "MEMBER");
    const bystander = await createSignedInMember(browser, "MEMBER");

    const { taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Feature Status Workflow Task",
      members: [
        { user: assignee, projectRole: "MEMBER" },
        { user: bystander, projectRole: "MEMBER" },
      ],
      assignToFullNames: [assignee.fullName],
    });

    await assignee.page.goto(taskUrl);
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("To Do");
    await expect(assignee.page.getByTestId("display-task-version")).toHaveText("2");

    // Done status is excluded from the update dropdown by domain policy
    const optionTexts = await assignee.page.getByTestId("select-task-status").locator("option").allTextContents();
    expect(optionTexts).not.toContain("Done");

    await moveTaskToStatus(assignee.page, "In Progress");
    await expect(assignee.page.getByTestId("display-task-version")).toHaveText("3");

    await moveTaskToStatus(assignee.page, "Review");
    await expect(assignee.page.getByTestId("display-task-version")).toHaveText("4");

    // FR-21 c4: bystander member cannot see status move controls
    await bystander.page.goto(taskUrl);
    await expect(bystander.page.getByTestId("sidebar-status")).toHaveText("Review");
    await expect(bystander.page.getByTestId("form-change-status")).toHaveCount(0);

    await assignee.context.close();
    await bystander.context.close();
  });

  test("FR-21 c2 (Journey 7): posting a DONE status directly via request returns 403 and leaves status unchanged", async ({
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
    const bodyText = await response.text();
    expect(bodyText).toContain("Only an approval can complete a task");

    await assignee.page.reload();
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("To Do");
    await expect(assignee.page.getByTestId("display-task-version")).toHaveText(currentVersion.trim());

    await assignee.context.close();
  });
});
