import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in apps/web/.dev.vars or the environment`);
  }
  return value;
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(requireEnv("ADMIN_SEED_EMAIL"));
  await page.getByLabel("Password").fill(requireEnv("ADMIN_SEED_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin**");
}

export interface TestUser {
  email: string;
  fullName: string;
  password: string;
  context: BrowserContext;
  page: Page;
}

/**
 * Creates a dedicated MEMBER through the admin invite flow and signs them in, so a journey that
 * changes account data never touches the shared seeded admin.
 */
export async function createSignedInMember(
  browser: Browser,
  role: "MEMBER" | "PM" | "TEAM_LEAD" = "MEMBER",
): Promise<TestUser> {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAsAdmin(adminPage);
  await adminPage.goto("/admin/users");

  const createButton = adminPage.getByRole("button", { name: "+ Create User" });
  const modalHeading = adminPage.getByRole("heading", { level: 2, name: "Create New User" });
  await expect(async () => {
    await createButton.click();
    await expect(modalHeading).toBeVisible({ timeout: 1000 });
  }).toPass({ intervals: [500], timeout: 10000 });

  const uniqueId = Math.random().toString(36).slice(2, 8);
  const email = `profile.${uniqueId}@example.com`;
  const fullName = `Profile User ${uniqueId}`;
  await adminPage.getByLabel("Full Name").fill(fullName);
  await adminPage.getByLabel("Email Address").fill(email);
  if (role !== "MEMBER") {
    await adminPage.locator("#create-systemRole").selectOption(role);
  }
  await adminPage.getByRole("button", { name: "Create User", exact: true }).click();

  await expect(adminPage.getByText("User account created successfully!")).toBeVisible();
  const inviteUrl = await adminPage.locator("input[readonly]").inputValue();
  await adminContext.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const password = `InitialPw!${uniqueId}`;
  await page.goto(new URL(inviteUrl).pathname);
  await page.getByLabel("New Password").fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Set Password and Sign In" }).click();
  await page.waitForURL(role === "PM" ? "**/admin**" : "**/");

  return { email, fullName, password, context, page };
}

export interface ProjectTaskSetup {
  projectId: string;
  projectCode: string;
  taskUrl: string;
  doneStatusId: string;
}

export async function setupProjectWithTask(
  browser: Browser,
  options: {
    taskTitle: string;
    members?: Array<{ user: TestUser; projectRole: "PM" | "TEAM_LEAD" | "MEMBER" }>;
    assignToFullNames?: string[];
  },
): Promise<ProjectTaskSetup> {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAsAdmin(adminPage);

  await adminPage.goto("/projects/new");
  const projectCode = `WF${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const projectName = `Workflow Project ${projectCode}`;
  await adminPage.getByLabel("Project Code").fill(projectCode);
  await adminPage.getByLabel("Project Name").fill(projectName);
  await adminPage.getByLabel("Start Date").fill("2026-11-01");
  await adminPage.getByLabel("End Date").fill("2026-12-31");
  await adminPage.getByRole("button", { name: "Create Project" }).click();

  await adminPage.waitForURL("**/projects");
  await adminPage.getByRole("link", { name: projectName }).click();
  await adminPage.waitForURL("**/projects/*");

  const projectId = adminPage.url().split("/projects/")[1]?.split("/")[0] ?? "";

  for (const m of options.members ?? []) {
    await adminPage.goto(`/projects/${projectId}/members`);
    await expect(adminPage.getByTestId("members-table")).toBeVisible();
    await adminPage.getByTestId("search-user-input").fill(m.user.email);
    const userSelect = adminPage.getByTestId("search-user-select");
    await expect(userSelect).toBeVisible();
    await userSelect.selectOption({ label: `${m.user.fullName} (${m.user.email})` });
    await adminPage.getByTestId("add-member-role-select").selectOption(m.projectRole);
    await adminPage.getByTestId("add-member-submit-btn").click();
    await expect(adminPage.getByTestId("members-table")).toContainText(m.user.email);
  }

  await adminPage.goto(`/projects/${projectId}`);
  const doneStatusId = await adminPage
    .getByTestId("filter-status-select")
    .locator("option", { hasText: "Done" })
    .getAttribute("value");

  await adminPage.getByTestId("create-task-button").click();
  await adminPage.getByTestId("task-title-input").fill(options.taskTitle);
  await adminPage.getByTestId("task-submit-button").click();

  await expect(adminPage.getByTestId("tasks-table")).toContainText(options.taskTitle);
  await adminPage.getByRole("link", { name: options.taskTitle }).click();
  await adminPage.waitForURL("**/tasks/*");
  const taskUrl = adminPage.url();

  if (options.assignToFullNames && options.assignToFullNames.length > 0) {
    await adminPage.getByTestId("btn-toggle-assign").click();
    for (const fullName of options.assignToFullNames) {
      await adminPage.getByLabel(fullName).check();
    }
    await adminPage.getByTestId("btn-save-assign").click();
    for (const fullName of options.assignToFullNames) {
      await expect(adminPage.getByTestId("sidebar-assignees")).toContainText(fullName);
    }
  }

  await adminContext.close();
  return {
    projectId,
    projectCode,
    taskUrl,
    doneStatusId: doneStatusId ?? "",
  };
}

export async function moveTaskToStatus(page: Page, statusLabel: string): Promise<void> {
  const select = page.getByTestId("select-task-status");
  await expect(select).toBeVisible();
  await select.selectOption({ label: statusLabel });
  await page.getByTestId("btn-change-status").click();
  await expect(page.getByTestId("task-status-badge")).toHaveText(statusLabel);
  await expect(page.getByTestId("sidebar-status")).toHaveText(statusLabel);
}
