import { expect, test } from "@playwright/test";

import { createSignedInMember } from "./helpers";

test.describe("Project Roles Management (FR-11)", () => {
  test("FR-11 c1 & c2: PM changes member role, and last PM cannot be demoted", async ({ browser }) => {
    const pm = await createSignedInMember(browser, "PM");
    const member = await createSignedInMember(browser, "MEMBER");

    const pmPage = pm.page;

    // PM creates a project
    await pmPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `R-${uniqueId}`;
    const name = `Role Project ${uniqueId}`;

    await pmPage.getByTestId("input-code").fill(code);
    await pmPage.getByTestId("input-name").fill(name);
    await pmPage.getByTestId("input-start-date").fill("2026-11-01");
    await pmPage.getByTestId("input-end-date").fill("2026-12-31");
    await pmPage.getByTestId("submit-project-button").click();
    await pmPage.waitForURL("**/projects");

    // Open project
    await pmPage.getByRole("link", { name: code, exact: true }).click();
    await pmPage.waitForURL("**/projects/*");
    const projectUrl = pmPage.url();
    const projectId = projectUrl.split("/projects/")[1]?.split("/")[0] ?? "";

    // Go to members page
    await pmPage.goto(`/projects/${projectId}/members`);

    // Add member to project
    await pmPage.getByTestId("search-user-input").fill(member.email);
    await expect(pmPage.getByTestId("search-user-select")).toBeVisible();
    await pmPage.getByTestId("search-user-select").selectOption({ label: `${member.fullName} (${member.email})` });
    await pmPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await pmPage.getByTestId("add-member-submit-btn").click();

    // Verify member added
    const memberRow = pmPage.locator("tr", { hasText: member.fullName });
    await expect(memberRow).toBeVisible();

    // FR-11 c1: Change member's role from MEMBER to TEAM_LEAD
    const memberRoleSelect = memberRow.locator("select[name='projectRole']");
    await expect(memberRoleSelect).toBeVisible();
    await memberRoleSelect.selectOption("TEAM_LEAD");

    // Verify that the select now has TEAM_LEAD selected after submission
    await expect(memberRow.locator("select[name='projectRole']")).toHaveValue("TEAM_LEAD");

    // FR-11 c2: Attempt to demote the only PM to MEMBER
    const pmRow = pmPage.locator("tr", { hasText: pm.fullName });
    const pmRoleSelect = pmRow.locator("select[name='projectRole']");
    await pmRoleSelect.selectOption("MEMBER");

    // Verify error banner
    await expect(pmPage.getByTestId("action-error")).toHaveText("A project needs at least one PM");

    // Reload to verify server state remained PM
    await pmPage.reload();
    await expect(pmPage.locator("tr", { hasText: pm.fullName }).locator("select[name='projectRole']")).toHaveValue(
      "PM",
    );

    // Verify for the member that they can log in, view members, but have read-only badge (FR-11 c3)
    const memberPage = member.page;
    await memberPage.goto(`/projects/${projectId}/members`);
    await expect(memberPage.getByTestId("members-table")).toBeVisible();
    const memberRowOnMemberPage = memberPage.locator("tr", { hasText: member.fullName });
    // Regular member sees role badge, NOT a role select
    await expect(memberRowOnMemberPage.getByText("Team lead")).toBeVisible();
    await expect(memberRowOnMemberPage.locator("select[name='projectRole']")).not.toBeVisible();

    await member.context.close();
    await pm.context.close();
  });
});
