import { expect, test } from "@playwright/test";

import { createSignedInMember } from "./helpers";

test.describe("Project Members Management (FR-10)", () => {
  test("FR-10: PM searches active non-members, adds member, invites new user, and removes member", async ({
    browser,
  }) => {
    // Create PM user and a Candidate member user
    const pm = await createSignedInMember(browser, "PM");
    const candidate = await createSignedInMember(browser, "MEMBER");

    const pmPage = pm.page;

    // PM creates a project
    await pmPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `M-${uniqueId}`;
    const name = `Members Project ${uniqueId}`;

    await pmPage.getByTestId("input-code").fill(code);
    await pmPage.getByTestId("input-name").fill(name);
    await pmPage.getByTestId("input-start-date").fill("2026-11-01");
    await pmPage.getByTestId("input-end-date").fill("2026-12-31");
    await pmPage.getByTestId("submit-project-button").click();
    await pmPage.waitForURL("**/projects");

    // Open project
    await pmPage.getByRole("link", { name: code, exact: true }).click();
    await pmPage.waitForURL("**/projects/*");

    // Go to Members page
    const projectUrl = pmPage.url();
    const projectId = projectUrl.split("/projects/")[1]?.split("/")[0] ?? "";
    await pmPage.goto(`/projects/${projectId}/members`);

    // Verify PM is in the members table
    await expect(pmPage.getByTestId("members-table")).toBeVisible();
    await expect(pmPage.getByTestId("members-table").getByText(pm.fullName)).toBeVisible();

    // Search for Candidate user in Add Existing User form
    await pmPage.getByTestId("search-user-input").fill(candidate.email);
    const userSelect = pmPage.getByTestId("search-user-select");
    await expect(userSelect).toBeVisible();
    await userSelect.selectOption({ label: `${candidate.fullName} (${candidate.email})` });

    // Select role and submit
    await pmPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await pmPage.getByTestId("add-member-submit-btn").click();

    // Verify candidate is now in members table
    await expect(pmPage.getByTestId("success-banner")).toBeVisible();
    await expect(pmPage.getByTestId("members-table").getByText(candidate.fullName)).toBeVisible();

    // Invite new user by email
    const inviteEmail = `invitee.${uniqueId.toLowerCase()}@example.com`;
    await pmPage.getByTestId("invite-email-input").fill(inviteEmail);
    await pmPage.getByTestId("invite-role-select").selectOption("TEAM_LEAD");
    await pmPage.getByTestId("invite-submit-btn").click();

    // Verify invite link box appears
    await expect(pmPage.getByTestId("invite-url-box")).toBeVisible();
    await expect(pmPage.getByTestId("invite-url-link")).toHaveValue(new RegExp(`/invite/[a-f0-9]+`));

    // Verify pending invitations table lists the invited email
    await expect(pmPage.getByTestId("pending-invites-table")).toBeVisible();
    await expect(pmPage.getByText(inviteEmail)).toBeVisible();

    // Remove candidate from project
    // Handle browser confirmation dialog
    pmPage.once("dialog", (dialog) => dialog.accept());
    const candidateRow = pmPage.locator("tr", { hasText: candidate.fullName });
    await candidateRow.getByRole("button", { name: "Remove" }).click();

    // Verify member is removed from table
    await expect(pmPage.getByTestId("success-banner")).toBeVisible();
    await expect(pmPage.getByTestId("members-table").getByText(candidate.fullName)).not.toBeVisible();

    await candidate.context.close();
    await pm.context.close();
  });

  test("FR-10 c5 & c6: last PM cannot be removed; non-lead members cannot modify members", async ({ browser }) => {
    const pm = await createSignedInMember(browser, "PM");
    const otherMember = await createSignedInMember(browser, "MEMBER");

    const pmPage = pm.page;

    // PM creates a project
    await pmPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `L-${uniqueId}`;
    const name = `Last PM Project ${uniqueId}`;

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

    // PM adds otherMember to the project
    await pmPage.goto(`/projects/${projectId}/members`);
    await pmPage.getByTestId("search-user-input").fill(otherMember.email);
    await expect(pmPage.getByTestId("search-user-select")).toBeVisible();
    await pmPage
      .getByTestId("search-user-select")
      .selectOption({ label: `${otherMember.fullName} (${otherMember.email})` });
    await pmPage.getByTestId("add-member-submit-btn").click();
    await expect(pmPage.getByTestId("members-table").getByText(otherMember.fullName)).toBeVisible();

    // PM tries to remove self (the only PM)
    pmPage.once("dialog", (dialog) => dialog.accept());
    // Click remove for PM
    const pmRow = pmPage.locator("tr", { hasText: pm.fullName });
    await pmRow.getByRole("button", { name: "Remove" }).click();

    // Verify error banner
    await expect(pmPage.getByTestId("action-error")).toHaveText("A project needs at least one PM");

    // Now test otherMember (regular member): can view members, cannot see add/invite forms
    const memberPage = otherMember.page;
    await memberPage.goto(`/projects/${projectId}/members`);
    await expect(memberPage.getByTestId("members-table")).toBeVisible();
    await expect(memberPage.getByTestId("add-member-form")).not.toBeVisible();
    await expect(memberPage.getByTestId("invite-member-form")).not.toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Remove" })).not.toBeVisible();

    await otherMember.context.close();
    await pm.context.close();
  });

  test("P3: non-members receive 404 when navigating to project members page", async ({ browser }) => {
    const pm = await createSignedInMember(browser, "PM");
    const nonMember = await createSignedInMember(browser, "MEMBER");

    // PM creates a project
    const pmPage = pm.page;
    await pmPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `N-${uniqueId}`;

    await pmPage.getByTestId("input-code").fill(code);
    await pmPage.getByTestId("input-name").fill(`Non-Member Test ${uniqueId}`);
    await pmPage.getByTestId("input-start-date").fill("2026-11-01");
    await pmPage.getByTestId("input-end-date").fill("2026-12-31");
    await pmPage.getByTestId("submit-project-button").click();
    await pmPage.waitForURL("**/projects");

    await pmPage.getByRole("link", { name: code, exact: true }).click();
    await pmPage.waitForURL("**/projects/*");
    const projectUrl = pmPage.url();
    const projectId = projectUrl.split("/projects/")[1]?.split("/")[0] ?? "";

    // Non-member visits /projects/:projectId/members
    const nonMemberPage = nonMember.page;
    const response = await nonMemberPage.goto(`/projects/${projectId}/members`);
    expect(response?.status()).toBe(404);

    await nonMember.context.close();
    await pm.context.close();
  });
});
