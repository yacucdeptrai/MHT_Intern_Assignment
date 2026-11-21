import { expect, test } from "@playwright/test";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask } from "./helpers";

test.describe("Journey 5: Task Approval Workflow (FR-22, FR-23)", () => {
  test("member moves task to Review; lead rejects with reason; member resubmits; lead approves -> reason is comment, status is Done, sprint completion is 100%", async ({
    browser,
  }) => {
    test.slow();
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const assignee = await createSignedInMember(browser, "MEMBER");

    const { projectId, taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Journey 5 Approval Task",
      members: [
        { user: lead, projectRole: "TEAM_LEAD" },
        { user: assignee, projectRole: "MEMBER" },
      ],
      assignToFullNames: [assignee.fullName],
    });

    // 1. Lead creates a sprint and links the task to it
    const sprintName = `Sprint J5 ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await lead.page.goto(`/projects/${projectId}/sprints`);
    await lead.page.getByTestId("create-sprint-btn").click();
    await lead.page.getByTestId("sprint-name-input").fill(sprintName);
    await lead.page.getByTestId("sprint-start-date-input").fill("2026-11-01");
    await lead.page.getByTestId("sprint-end-date-input").fill("2026-11-14");
    await lead.page.getByTestId("create-sprint-submit-btn").click();
    await expect(lead.page.getByTestId("sprints-table")).toBeVisible();

    // Link task to sprint
    await lead.page.goto(taskUrl);
    await lead.page.getByTestId("edit-task-button").click();
    await expect(lead.page.getByTestId("edit-task-form")).toBeVisible();
    await lead.page.getByTestId("edit-sprint-select").selectOption({ label: sprintName });
    await lead.page.getByTestId("save-task-button").click();
    await expect(lead.page.getByTestId("sidebar-sprint")).toHaveText(sprintName);

    // 2. Member moves the task to Review
    await assignee.page.goto(taskUrl);
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("To Do");
    await moveTaskToStatus(assignee.page, "Review");
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("Review");

    // 3. Lead rejects with a reason
    const rejectionReason = "Please add unit tests and verify edge cases";
    await lead.page.reload();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Review");
    await expect(lead.page.getByTestId("reject-task-button")).toBeVisible();
    await lead.page.getByTestId("reject-task-button").click();
    await expect(lead.page.getByTestId("form-reason-transition")).toBeVisible();
    await lead.page.getByTestId("input-task-reason").fill(rejectionReason);
    await lead.page.getByTestId("submit-reason-button").click();

    // 4. Reason appears as a comment, and task returns to In Progress
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("In Progress");
    await lead.page.getByTestId("drawer-tab-activity").click();
    await expect(lead.page.getByTestId("comments-section")).toContainText(rejectionReason);

    // 5. Member sees rejection comment and resubmits to Review
    await assignee.page.reload();
    await assignee.page.getByTestId("drawer-tab-activity").click();
    await expect(assignee.page.getByTestId("comments-section")).toContainText(rejectionReason);
    await moveTaskToStatus(assignee.page, "Review");
    await expect(assignee.page.getByTestId("task-status-badge")).toHaveText("Review");

    // 6. Lead approves -> final status is Done
    await lead.page.reload();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Review");
    await expect(lead.page.getByTestId("approve-task-button")).toBeVisible();
    await lead.page.getByTestId("approve-task-button").click();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Done");

    // 7. Sprint completion shows 100%
    await lead.page.goto(`/projects/${projectId}/sprints`);
    await expect(lead.page.getByTestId("sprint-completion")).toContainText("100%");

    await lead.context.close();
    await assignee.context.close();
  });
});
