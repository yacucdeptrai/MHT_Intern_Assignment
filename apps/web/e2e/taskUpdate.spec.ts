import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

test.describe("Task Update Journey (FR-13)", () => {
  test("FR-13 c1: allowed editor updates task fields, version increments", async ({ page }) => {
    await signInAsAdmin(page);

    // Create a new project
    await page.goto("/projects/new");
    const code = `UPD${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Update Task Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: `Update Task Project ${code}` }).click();

    // Create task
    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Original Task Title");
    await page.getByTestId("task-description-input").fill("Original description");
    await page.getByTestId("task-priority-select").selectOption("LOW");
    await page.getByTestId("task-submit-button").click();

    // Open task detail page
    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await page.getByRole("link", { name: "Original Task Title" }).click();
    await page.waitForURL("**/tasks/*");

    // Verify task detail page loaded with version 1
    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await expect(page.getByTestId("task-title")).toHaveText("Original Task Title");
    await expect(page.getByTestId("display-task-version")).toHaveText("1");
    await expect(page.getByTestId("task-priority-badge")).toHaveText("LOW");

    // Click Edit Task
    await page.getByTestId("edit-task-button").click();
    await expect(page.getByTestId("edit-task-form")).toBeVisible();

    // Edit fields
    await page.getByTestId("edit-title-input").fill("Modified Task Title");
    await page.getByTestId("edit-description-input").fill("Modified description content");
    await page.getByTestId("edit-priority-select").selectOption("URGENT");
    await page.getByTestId("edit-start-date-input").fill("2026-11-10");
    await page.getByTestId("edit-due-date-input").fill("2026-11-20");

    // Save
    await page.getByTestId("save-task-button").click();

    // Verify updated details and version incremented to 2
    await expect(page.getByTestId("task-title")).toHaveText("Modified Task Title");
    await expect(page.getByTestId("task-description")).toHaveText("Modified description content");
    await expect(page.getByTestId("task-priority-badge")).toHaveText("URGENT");
    await expect(page.getByTestId("display-task-version")).toHaveText("2");
    await expect(page.getByTestId("sidebar-start-date")).toHaveText("2026-11-10");
    await expect(page.getByTestId("sidebar-due-date")).toHaveText("2026-11-20");
  });

  test("FR-13 c2: optimistic conflict banner shown when submitting stale version", async ({ page }) => {
    await signInAsAdmin(page);

    // Create project
    await page.goto("/projects/new");
    const code = `CNF${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Conflict Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: `Conflict Project ${code}` }).click();

    // Create task
    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Conflict Target Task");
    await page.getByTestId("task-submit-button").click();

    await page.getByRole("link", { name: "Conflict Target Task" }).click();
    await page.waitForURL("**/tasks/*");
    await expect(page.getByTestId("task-detail-page")).toBeVisible();

    // Open edit form
    await page.getByTestId("edit-task-button").click();
    await expect(page.getByTestId("edit-task-form")).toBeVisible();

    // Tamper the hidden version input to simulate a stale submission
    await page.locator('[data-testid="input-task-version"]').evaluate((element) => {
      (element as unknown as { value: string }).value = "999";
    });

    await page.getByTestId("edit-title-input").fill("Should Conflict Title");
    await page.getByTestId("save-task-button").click();

    // Conflict banner must appear
    await expect(page.getByTestId("conflict-banner")).toBeVisible();
    await expect(
      page.getByText("This task was changed by someone else. Reload to see the latest version."),
    ).toBeVisible();
    await expect(page.getByTestId("reload-version-button")).toBeVisible();
  });

  test("FR-13 c3: member who is neither creator nor assignee cannot edit", async ({ browser }) => {
    // Admin creates project and adds member
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    const member = await createSignedInMember(browser, "MEMBER");

    await adminPage.goto("/projects/new");
    const code = `RO${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await adminPage.getByLabel("Project Code").fill(code);
    await adminPage.getByLabel("Project Name").fill(`Role Check Project ${code}`);
    await adminPage.getByLabel("Start Date").fill("2026-11-01");
    await adminPage.getByLabel("End Date").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Create Project" }).click();

    await adminPage.waitForURL("**/projects");
    await adminPage.getByRole("link", { name: `Role Check Project ${code}` }).click();
    await adminPage.waitForURL("**/projects/*");

    // Add member to project
    const currentUrl = adminPage.url();
    const projectId = currentUrl.split("/projects/")[1]?.split("/")[0] ?? "";
    await adminPage.goto(`/projects/${projectId}/members`);
    await adminPage.getByTestId("search-user-input").fill(member.email);
    const userSelect = adminPage.getByTestId("search-user-select");
    await expect(userSelect).toBeVisible();
    await userSelect.selectOption({ label: `${member.fullName} (${member.email})` });
    await adminPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await adminPage.getByTestId("add-member-submit-btn").click();
    await expect(adminPage.getByTestId("members-table").getByText(member.fullName)).toBeVisible();

    // Admin creates task without assigning member
    await adminPage.goto(`/projects/${projectId}`);
    await adminPage.getByTestId("create-task-button").click();
    await adminPage.getByTestId("task-title-input").fill("Admin Private Task");
    await adminPage.getByTestId("task-submit-button").click();

    await adminPage.getByRole("link", { name: "Admin Private Task" }).click();
    await adminPage.waitForURL("**/tasks/*");
    const taskUrl = adminPage.url();
    await adminContext.close();

    // Member visits task detail
    await member.page.goto(taskUrl);
    await expect(member.page.getByTestId("task-detail-page")).toBeVisible();
    await expect(member.page.getByTestId("task-title")).toHaveText("Admin Private Task");

    // Edit button must NOT be visible for this member
    await expect(member.page.getByTestId("edit-task-button")).not.toBeVisible();

    await member.context.close();
  });

  test("FR-13 c3: non-member receives 404 when navigating to task detail", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    await adminPage.goto("/projects/new");
    const code = `SEC${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await adminPage.getByLabel("Project Code").fill(code);
    await adminPage.getByLabel("Project Name").fill(`Secret Project ${code}`);
    await adminPage.getByLabel("Start Date").fill("2026-11-01");
    await adminPage.getByLabel("End Date").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Create Project" }).click();

    await adminPage.waitForURL("**/projects");
    await adminPage.getByRole("link", { name: `Secret Project ${code}` }).click();
    await adminPage.waitForURL("**/projects/*");

    await adminPage.getByTestId("create-task-button").click();
    await adminPage.getByTestId("task-title-input").fill("Secret Task");
    await adminPage.getByTestId("task-submit-button").click();

    await adminPage.getByRole("link", { name: "Secret Task" }).click();
    await adminPage.waitForURL("**/tasks/*");
    const taskUrl = adminPage.url();
    await adminContext.close();

    // Create another user who is NOT a member
    const nonMember = await createSignedInMember(browser, "MEMBER");
    const response = await nonMember.page.goto(taskUrl);

    expect(response?.status()).toBe(404);
    await nonMember.context.close();
  });

  test("FR-15 c1: project lead assigns task to project member, version increments", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);

    // Create project
    await adminPage.goto("/projects/new");
    const code = `ASN${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await adminPage.getByLabel("Project Code").fill(code);
    await adminPage.getByLabel("Project Name").fill(`Assign Task Project ${code}`);
    await adminPage.getByLabel("Start Date").fill("2026-11-01");
    await adminPage.getByLabel("End Date").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Create Project" }).click();

    await adminPage.waitForURL("**/projects");
    await adminPage.getByRole("link", { name: `Assign Task Project ${code}` }).click();
    await adminPage.waitForURL("**/projects/*");

    const projectUrl = adminPage.url();
    const projectId = projectUrl.split("/projects/")[1]?.split("/")[0] ?? "";

    // Add a member
    const member = await createSignedInMember(browser, "MEMBER");
    await adminPage.goto(`/projects/${projectId}/members`);
    await expect(adminPage.getByTestId("members-table")).toBeVisible();
    await adminPage.getByTestId("search-user-input").fill(member.email);
    const userSelect = adminPage.getByTestId("search-user-select");
    await expect(userSelect).toBeVisible();
    await userSelect.selectOption({ label: `${member.fullName} (${member.email})` });
    await adminPage.getByTestId("add-member-role-select").selectOption("MEMBER");
    await adminPage.getByTestId("add-member-submit-btn").click();
    await expect(adminPage.getByTestId("members-table")).toContainText(member.email);

    // Go to project tasks and create task
    await adminPage.goto(`/projects/${projectId}`);
    await adminPage.getByTestId("create-task-button").click();
    await adminPage.getByTestId("task-title-input").fill("Task to Assign");
    await adminPage.getByTestId("task-submit-button").click();

    await adminPage.getByRole("link", { name: "Task to Assign" }).click();
    await adminPage.waitForURL("**/tasks/*");

    await expect(adminPage.getByTestId("display-task-version")).toHaveText("1");
    await expect(adminPage.getByTestId("sidebar-assignees")).toContainText("Unassigned");

    // Click Change assignees
    await adminPage.getByTestId("btn-toggle-assign").click();
    await expect(adminPage.getByTestId("form-assign")).toBeVisible();

    // Check member
    await adminPage.getByLabel(member.fullName).check();
    await adminPage.getByTestId("btn-save-assign").click();

    // Verify assigned
    await expect(adminPage.getByTestId("display-task-version")).toHaveText("2");
    await expect(adminPage.getByTestId("sidebar-assignees")).toContainText(member.fullName);

    await adminContext.close();
    await member.context.close();
  });

  test("FR-14 c1: lead archives task, redirects to project page and hides task from active list", async ({ page }) => {
    await signInAsAdmin(page);

    // Create project
    await page.goto("/projects/new");
    const code = `ARC${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Archive Task Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: `Archive Task Project ${code}` }).click();

    // Create task
    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Task to be Archived");
    await page.getByTestId("task-submit-button").click();

    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await page.getByRole("link", { name: "Task to be Archived" }).click();
    await page.waitForURL("**/tasks/*");

    // Click Archive Task
    await expect(page.getByTestId("archive-task-button")).toBeVisible();
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.getByTestId("archive-task-button").click();

    // Redirects to project tasks list
    await page.waitForURL("**/projects/*");
    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await expect(page.getByTestId("tasks-table")).not.toContainText("Task to be Archived");
  });
});
