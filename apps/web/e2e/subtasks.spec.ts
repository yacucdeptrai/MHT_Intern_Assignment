import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers";

test.describe("Sub-tasks Journey (FR-17)", () => {
  test("FR-17 c1: member creates sub-tasks under top-level task, parent shows done/total progress", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    // Create a new project
    await page.goto("/projects/new");
    const code = `SUB${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await page.getByLabel("Project Code").fill(code);
    await page.getByLabel("Project Name").fill(`Subtasks Test Project ${code}`);
    await page.getByLabel("Start Date").fill("2026-11-01");
    await page.getByLabel("End Date").fill("2026-12-31");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForURL("**/projects");
    await page
      .getByRole("main")
      .getByRole("link", { name: `Subtasks Test Project ${code}` })
      .click();

    // Create top-level task
    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Parent Feature Task");
    await page.getByTestId("task-submit-button").click();

    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await page.getByRole("link", { name: "Parent Feature Task" }).click();
    await page.waitForURL("**/tasks/*");

    // Parent task detail page
    await expect(page.getByTestId("task-title")).toHaveText("Parent Feature Task");
    await expect(page.getByTestId("add-subtask-button")).toBeVisible();
    /* cspell:disable */
    await expect(page.getByTestId("subtasks-section")).toContainText(/No sub-tasks|Chưa có công việc phụ/i);
    /* cspell:enable */

    // Add first sub-task
    await page.getByTestId("add-subtask-button").click();
    await expect(page.getByTestId("form-add-subtask")).toBeVisible();
    await page.getByTestId("input-subtask-title").fill("First Subtask");
    await page.getByTestId("select-subtask-priority").selectOption("HIGH");
    await page.getByTestId("btn-create-subtask").click();

    // Verify first sub-task appears and progress shows 0 / 1 done
    await expect(page.getByTestId("subtask-row")).toBeVisible();
    await expect(page.getByTestId("subtask-link")).toHaveText("First Subtask");
    /* cspell:disable */
    await expect(page.getByTestId("subtask-progress")).toHaveText(/0 \/ 1 (done|hoàn thành)/i);
    /* cspell:enable */

    // Add second sub-task
    await page.getByTestId("add-subtask-button").click();
    await expect(page.getByTestId("form-add-subtask")).toBeVisible();
    await page.getByTestId("input-subtask-title").fill("Second Subtask");
    await page.getByTestId("btn-create-subtask").click();

    // Progress updates to 0 / 2 done
    /* cspell:disable */
    await expect(page.getByTestId("subtask-progress")).toHaveText(/0 \/ 2 (done|hoàn thành)/i);
    /* cspell:enable */

    // Navigate into first sub-task
    await page.getByRole("link", { name: "First Subtask" }).click();
    await page.waitForURL("**/tasks/*");

    // FR-17 c2: Verify sub-task shows breadcrumb pointing to parent and does NOT show Add Sub-task button
    await expect(page.getByTestId("task-title")).toHaveText("First Subtask");
    await expect(page.getByTestId("add-subtask-button")).not.toBeVisible();
  });
});
