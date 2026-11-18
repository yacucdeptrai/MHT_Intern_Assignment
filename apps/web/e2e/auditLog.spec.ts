import { expect, test } from "@playwright/test";

import { APP_TIMEZONE } from "@pm/domain";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask, signInAsAdmin } from "./helpers";

test.describe("Audit Log and Task History Journey (FR-24)", () => {
  test("FR-24 c1..c4: member sees task history with rejection reason; PM and Member get 403 on /admin/audit-log; Admin filters system audit log", async ({
    browser,
  }) => {
    test.slow();
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const pm = await createSignedInMember(browser, "PM");
    const member = await createSignedInMember(browser, "MEMBER");

    const { projectCode, taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Audit Trail Task",
      members: [
        { user: lead, projectRole: "TEAM_LEAD" },
        { user: member, projectRole: "MEMBER" },
      ],
      assignToFullNames: [member.fullName],
    });

    // Member moves task to Review, Lead rejects with reason
    await member.page.goto(taskUrl);
    await moveTaskToStatus(member.page, "Review");

    const rejectionReason = `Missing regression coverage for ${projectCode}`;
    await lead.page.goto(taskUrl);
    await lead.page.getByTestId("reject-task-button").click();
    await lead.page.getByTestId("input-task-reason").fill(rejectionReason);
    await lead.page.getByTestId("submit-reason-button").click();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("In Progress");

    // FR-24 c1, c3: Project member opens task and sees task history newest first, including reason & diffs
    await member.page.reload();
    const historySection = member.page.getByTestId("task-history-section");
    await expect(historySection).toBeVisible();

    const historyRows = historySection.getByTestId("task-history-row");
    await expect(historyRows).toHaveCount(4);
    await expect(historyRows.nth(0)).toContainText(lead.fullName);
    await expect(historyRows.nth(0)).toContainText("TASK_REJECTED");
    await expect(historyRows.nth(0).getByTestId("task-history-reason")).toContainText(rejectionReason);
    await expect(historyRows.nth(1)).toContainText("TASK_STATUS_CHANGED");
    await expect(historyRows.nth(2)).toContainText("TASK_ASSIGNED");
    await expect(historyRows.nth(3)).toContainText("TASK_CREATED");

    // FR-24 c4: System PM (who can access /admin dashboard) does not see Audit Log link and gets 403 on /admin/audit-log
    await pm.page.goto("/admin");
    await expect(pm.page.getByRole("link", { name: "Audit Log" })).toHaveCount(0);
    const pmAuditRes = await pm.page.goto("/admin/audit-log");
    expect(pmAuditRes?.status()).toBe(403);
    await expect(pm.page.getByRole("heading", { name: "Forbidden" })).toBeVisible();

    // FR-24 c4: System MEMBER gets 403 on /admin/audit-log
    const memberAuditRes = await member.page.goto("/admin/audit-log");
    expect(memberAuditRes?.status()).toBe(403);
    await expect(member.page.getByRole("heading", { name: "Forbidden" })).toBeVisible();

    // FR-24 c2: Admin opens /admin/audit-log and filters by actor, entity type, action, and date range
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    await adminPage.getByRole("link", { name: "Audit Log" }).click();
    await adminPage.waitForURL("**/admin/audit-log");
    await expect(adminPage.getByTestId("audit-pagination")).toContainText("50 per page");

    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
    await adminPage.getByTestId("filter-actor").selectOption({ label: `${lead.fullName} (${lead.email})` });
    await adminPage.getByTestId("filter-entity-type").selectOption("TASK");
    await adminPage.getByTestId("filter-action").selectOption("TASK_REJECTED");
    await adminPage.getByTestId("filter-from").fill(todayStr);
    await adminPage.getByTestId("filter-to").fill(todayStr);
    await adminPage.getByTestId("btn-apply-audit-filters").click();

    await expect(adminPage).toHaveURL(/entityType=TASK/);
    await expect(adminPage).toHaveURL(/action=TASK_REJECTED/);

    const auditRows = adminPage.getByTestId("audit-log-row");
    await expect(auditRows).toHaveCount(1);
    await expect(auditRows.nth(0)).toContainText(lead.fullName);
    await expect(auditRows.nth(0)).toContainText("TASK_REJECTED");
    await expect(auditRows.nth(0)).toContainText(projectCode);
    await expect(auditRows.nth(0)).toContainText(rejectionReason);

    await adminContext.close();
    await lead.context.close();
    await pm.context.close();
    await member.context.close();
  });
});
