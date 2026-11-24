import { expect, test } from "@playwright/test";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask } from "./helpers";

test.describe("Task Reject and Reopen Journey (FR-23)", () => {
  test("FR-23 c1..c4: lead rejects Review task (empty reason -> 400, valid reason -> In Progress), approves, then reopens Done task", async ({
    browser,
  }) => {
    test.slow();
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const assignee = await createSignedInMember(browser, "MEMBER");

    const { taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Reject And Reopen Task",
      members: [
        { user: lead, projectRole: "TEAM_LEAD" },
        { user: assignee, projectRole: "MEMBER" },
      ],
      assignToFullNames: [assignee.fullName],
    });

    await assignee.page.goto(taskUrl);
    await moveTaskToStatus(assignee.page, "Review");
    const reviewVersion = (await assignee.page.getByTestId("display-task-version").textContent()) ?? "3";

    // FR-23 c4: Member does not see Reject button, and direct POST gets 403
    await expect(assignee.page.getByTestId("reject-task-button")).toHaveCount(0);
    const memberRejectRes = await assignee.page.request.post(taskUrl, {
      form: { intent: "reject", version: reviewVersion.trim(), reason: "Member attempt" },
    });
    expect(memberRejectRes.status()).toBe(403);

    // FR-23 c2: Lead submits empty reason -> 400 "A reason is required", form remains open
    await lead.page.goto(taskUrl);
    await expect(lead.page.getByTestId("reject-task-button")).toBeVisible();
    await lead.page.getByTestId("reject-task-button").click();
    await expect(lead.page.getByTestId("form-reason-transition")).toBeVisible();
    await lead.page.getByTestId("submit-reason-button").click();
    await expect(lead.page.getByTestId("error-reason")).toHaveText("A reason is required");
    await expect(lead.page.getByTestId("form-reason-transition")).toBeVisible();

    // FR-23 c1: Lead submits valid reason -> task returns to In Progress
    await lead.page.getByTestId("input-task-reason").fill("Please handle null dates in parser");
    await lead.page.getByTestId("submit-reason-button").click();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("In Progress");
    await expect(lead.page.getByTestId("form-reason-transition")).toHaveCount(0);

    // Assignee resubmits to Review, Lead approves to Done
    await assignee.page.reload();
    await moveTaskToStatus(assignee.page, "Review");

    await lead.page.reload();
    await lead.page.getByTestId("approve-task-button").click();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("Done");
    const doneVersion = (await lead.page.getByTestId("display-task-version").textContent()) ?? "6";

    // FR-23 c4: Member cannot reopen (403)
    await assignee.page.reload();
    await expect(assignee.page.getByTestId("reopen-task-button")).toHaveCount(0);
    const memberReopenRes = await assignee.page.request.post(taskUrl, {
      form: { intent: "reopen", version: doneVersion.trim(), reason: "Member reopen" },
    });
    expect(memberReopenRes.status()).toBe(403);

    // FR-23 c3: Lead reopens Done task with reason -> moves to In Progress and unfreezes editing
    await expect(lead.page.getByTestId("reopen-task-button")).toBeVisible();
    await lead.page.getByTestId("reopen-task-button").click();
    await lead.page.getByTestId("input-task-reason").fill("Found regression in staging smoke test");
    await lead.page.getByTestId("submit-reason-button").click();

    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("In Progress");
    await expect(lead.page.getByTestId("edit-task-button")).toBeVisible();
    // Reopened tasks are editable again: the status picker is back
    await expect(lead.page.getByTestId("status-picker")).toBeVisible();

    await lead.context.close();
    await assignee.context.close();
  });
});
