import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Sprint Management Journey (FR-36)", () => {
  test("FR-36: lead creates sprint, links task, updates sprint, and archives sprint unlinking task", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    // 1. Create a new project
    await page.goto("/projects/new");
    const code = `SPR${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Sprints E2E Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: `Sprints E2E Project ${code}` }).click();

    // 2. Navigate to Sprints page
    await page.getByRole("link", { name: "Sprints" }).click();
    await page.waitForURL("**/sprints");

    await expect(page.getByTestId("sprints-page")).toBeVisible();
    await expect(page.getByTestId("empty-sprints")).toBeVisible();

    // 3. Create a new sprint
    await page.getByTestId("create-sprint-btn").click();
    await expect(page.getByTestId("create-sprint-form")).toBeVisible();

    await page.getByTestId("sprint-name-input").fill("Sprint 1 E2E");
    await page.getByTestId("sprint-start-date-input").fill("2026-11-01");
    await page.getByTestId("sprint-end-date-input").fill("2026-11-14");
    await page.getByTestId("create-sprint-submit-btn").click();

    // 4. Verify sprint appears in table with "No tasks" completion rate
    await expect(page.getByTestId("sprints-table")).toBeVisible();
    await expect(page.getByTestId("sprint-name")).toHaveText("Sprint 1 E2E");
    await expect(page.getByTestId("sprint-completion")).toHaveText("No tasks");

    // 5. Edit sprint
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("edit-sprint-form")).toBeVisible();
    await page.getByTestId("edit-sprint-name-input").fill("Sprint 1 Renamed");
    await page.getByTestId("edit-sprint-submit-btn").click();

    await expect(page.getByTestId("sprint-name")).toHaveText("Sprint 1 Renamed");

    // 6. Create a task assigned to this sprint
    await page.getByRole("link", { name: "Tasks" }).click();
    await page.waitForURL("**/projects/*");

    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Task in Sprint 1");
    await page.getByTestId("task-sprint-select").selectOption({ label: "Sprint 1 Renamed" });
    await page.getByTestId("task-submit-button").click();

    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await expect(page.getByTestId("tasks-table")).toContainText("Task in Sprint 1");

    // 7. Verify Sprints page reflects task completion rate: 0% (0/1 done)
    await page.getByRole("link", { name: "Sprints" }).click();
    await page.waitForURL("**/sprints");
    await expect(page.getByTestId("sprint-completion")).toContainText("0%");
    await expect(page.getByTestId("sprint-completion")).toContainText("0/1 done");

    // 8. Archive the sprint
    await page.getByRole("button", { name: "Archive" }).click();

    // Verify sprint is removed from sprints table (empty state appears)
    await expect(page.getByTestId("empty-sprints")).toBeVisible();

    // 9. Verify task detail page shows Backlog (no sprint)
    await page.getByRole("link", { name: "Tasks" }).click();
    await page.waitForURL("**/projects/*");
    await page.getByRole("link", { name: "Task in Sprint 1" }).click();
    await page.waitForURL("**/tasks/*");

    await expect(page.getByTestId("sidebar-sprint")).toHaveText("Backlog");
  });
});
