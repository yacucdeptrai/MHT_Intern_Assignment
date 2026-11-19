/* cspell:disable */
import { expect, test } from "@playwright/test";

import { createSignedInMember } from "./helpers";

test.describe("Journey 3: Project Setup and Member Shell (FR-07, FR-10)", () => {
  test("PM creates a project and adds the lead and the member; project appears for members; member sees MemberShell", async ({
    browser,
  }) => {
    // 1. Create PM, Lead, and Member users
    const pm = await createSignedInMember(browser, "PM");
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const member = await createSignedInMember(browser, "MEMBER");

    const pmPage = pm.page;

    // 2. PM creates a project
    await pmPage.goto("/projects/new");
    const uniqueId = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `J3-${uniqueId}`;
    const name = `Journey 3 Project ${uniqueId}`;

    await pmPage.getByTestId("input-code").fill(code);
    await pmPage.getByTestId("input-name").fill(name);
    await pmPage.getByTestId("input-start-date").fill("2026-11-01");
    await pmPage.getByTestId("input-end-date").fill("2026-12-31");
    await pmPage.getByTestId("submit-project-button").click();
    await pmPage.waitForURL("**/projects");

    // Open project
    await pmPage.getByRole("link", { name: code, exact: true }).click();
    await pmPage.waitForURL("**/projects/*");
    const projectId = pmPage.url().split("/projects/")[1]?.split("/")[0] ?? "";

    // 3. PM navigates to Members page
    await pmPage.goto(`/projects/${projectId}/members`);
    await expect(pmPage.getByTestId("members-table")).toBeVisible();

    // Add Lead
    await pmPage.getByTestId("search-user-input").fill(lead.email);
    const leadSelect = pmPage.getByTestId("search-user-select");
    await expect(leadSelect).toBeVisible();
    await leadSelect.selectOption({ label: `${lead.fullName} (${lead.email})` });
    await pmPage.getByTestId("add-member-role-select").selectOption("TEAM_LEAD");
    await pmPage.getByTestId("add-member-submit-btn").click();
    await expect(pmPage.getByTestId("members-table")).toContainText(lead.fullName);

    // Add Member
    await pmPage.getByTestId("search-user-input").fill(member.email);
    const memberSelect = pmPage.getByTestId("search-user-select");
    await expect(memberSelect).toBeVisible();
    await memberSelect.selectOption({ label: `${member.fullName} (${member.email})` });
    await pmPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await pmPage.getByTestId("add-member-submit-btn").click();
    await expect(pmPage.getByTestId("members-table")).toContainText(member.fullName);

    // 4. Verify project appears for the member
    await member.page.goto("/projects");
    await expect(member.page.getByTestId(`project-row-${code}`)).toBeVisible();
    await expect(member.page.getByText(name)).toBeVisible();

    // 5. Verify Member sees MemberShell navigation
    const nav = member.page.getByRole("navigation");
    await expect(nav).toBeVisible();
    // Member nav items
    await expect(nav.getByRole("link", { name: /Dashboard|Bảng điều khiển/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /My tasks|Công việc của tôi/i, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /My projects|Dự án của tôi/i, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Calendar|Lịch biểu/i })).toBeVisible();

    // Admin links must NOT be visible to member
    await expect(nav.getByRole("link", { name: /Users|Người dùng/i })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /Statuses|Trạng thái/i })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /Audit Log|Nhật ký/i })).toHaveCount(0);

    // 6. Verify project also appears for the lead
    await lead.page.goto("/projects");
    await expect(lead.page.getByTestId(`project-row-${code}`)).toBeVisible();

    await pm.context.close();
    await lead.context.close();
    await member.context.close();
  });
});
