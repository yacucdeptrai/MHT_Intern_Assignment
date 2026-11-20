import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Project tasks views (FR-14, FR-16, FR-21)", () => {
  test("list, board and timeline views; dragging a card to In progress changes its status", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAdmin(page);

    const code = `VW${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Views Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.waitForURL("**/projects");
    await page.getByRole("main").getByRole("link", { name: code, exact: true }).click();
    await page.waitForURL("**/projects/*");
    const projectPath = new URL(page.url()).pathname;

    // Empty state offers New task
    await expect(page.getByTestId("empty-tasks")).toContainText("No tasks yet");

    const title = `Draggable task ${code}`;
    await page.getByTestId("create-task-button").click();
    await expect(page.getByTestId("create-task-dialog")).toBeVisible();
    await page.getByTestId("task-title-input").fill(title);
    await page.getByTestId("task-start-date-input").fill("2026-11-18");
    await page.getByTestId("task-due-date-input").fill("2026-11-25");
    await page.getByTestId("task-submit-button").click();
    await expect(page.getByTestId("create-task-dialog")).toHaveCount(0);
    await expect(page.getByTestId("tasks-table")).toContainText(title);
    await expect(page.getByTestId("tasks-table")).toContainText(`${code}-1`);
    await expect(page.getByTestId("project-tasks-count")).toHaveText("1 task");

    // Board: four category columns; drag the card from To do into In progress
    await page.getByTestId("view-board").click();
    await expect(page).toHaveURL(/view=board/);
    for (const category of ["TODO", "IN_PROGRESS", "REVIEW", "DONE"]) {
      await expect(page.getByTestId(`board-column-${category}`)).toBeVisible();
    }
    const card = page.locator('[data-testid^="task-card-"]').first();
    await expect(page.getByTestId("board-column-TODO")).toContainText(title);
    await card.dragTo(page.getByTestId("board-column-IN_PROGRESS"));
    await expect(page.getByTestId("board-column-IN_PROGRESS")).toContainText(title, { timeout: 10_000 });

    // Timeline shows the task row with its date range
    await page.getByTestId("view-timeline").click();
    await expect(page.getByTestId("timeline-view")).toBeVisible();
    await expect(page.locator('[data-testid^="timeline-row-"]').first()).toContainText(title);

    // Sprint filter lives in the URL; backlog keeps the unscheduled-sprint task
    await page.goto(`${projectPath}?view=list`);
    await page.getByTestId("filter-sprint-select").selectOption("backlog");
    await expect(page).toHaveURL(/sprintId=backlog/);
    await expect(page.getByTestId("tasks-table")).toContainText(title);
  });
});
