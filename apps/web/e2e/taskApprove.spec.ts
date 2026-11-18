import { expect, test } from "@playwright/test";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask } from "./helpers";

test.describe("Task Approval Journey (FR-22)", () => {
  test("FR-22 c1..c4: member moves task to Review, member cannot approve (403), lead assignee approves to Done", async ({
    browser,
  }) => {
    test.slow();
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const assignee = await createSignedInMember(browser, "MEMBER");

    const { taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Approval Workflow Task",
      members: [
        { user: lead, projectRole: "TEAM_LEAD" },
        { user: assignee, projectRole: "MEMBER" },
      ],
      assignToFullNames: [lead.fullName, assignee.fullName],
    });

    // FR-22 c2: Lead does not see Approve button while task is in To Do, and direct POST gets 400
    await lead.page.goto(taskUrl);
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("To Do");
    await expect(lead.page.getByTestId("approve-task-button")).toHaveCount(0);
    const todoVersion = (await lead.page.getByTestId("display-task-version").textContent()) ?? "2";

    const earlyRes = await lead.page.request.post(taskUrl, {
      form: { intent: "approve", version: todoVersion.trim() },
    });
    expect(earlyRes.status()).toBe(400);
    expect(await earlyRes.text()).toContain("Only tasks in review can be approved");

    // Assignee moves task to Review
    await assignee.page.goto(taskUrl);
    await moveTaskToStatus(assignee.page, "Review");
    const reviewVersion = (await assignee.page.getByTestId("display-task-version").textContent()) ?? "3";

    // FR-22 c3: Member assignee does not see Approve button, and direct POST gets 403
    await expect(assignee.page.getByTestId("approve-task-button")).toHaveCount(0);
    const memberApproveRes = await assignee.page.request.post(taskUrl, {
      form: { intent: "approve", version: reviewVersion.trim() },
    });
    expect(memberApproveRes.status()).toBe(403);

    // FR-22 c1, c4: Lead (who is also assigned) approves the task in Review
    await lead.page.reload();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Review");
    await expect(lead.page.getByTestId("approve-task-button")).toBeVisible();
    await lead.page.getByTestId("approve-task-button").click();

    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Done");
    await expect(lead.page.getByTestId("sidebar-status")).toHaveText("Done");
    await expect(lead.page.getByTestId("frozen-done-indicator")).toBeVisible();
    await expect(lead.page.getByTestId("approve-task-button")).toHaveCount(0);
    await expect(lead.page.getByTestId("form-change-status")).toHaveCount(0);

    await lead.context.close();
    await assignee.context.close();
  });
});
