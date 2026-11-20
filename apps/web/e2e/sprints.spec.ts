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
    /* cspell:disable */
    await page.getByLabel(/Project Code|Mã dự án/i).fill(code);
    await page.getByLabel(/Project Name|Tên dự án/i).fill(`Sprints E2E Project ${code}`);
    await page.getByLabel(/Start Date|Ngày bắt đầu/i).fill("2026-11-01");
    await page.getByLabel(/End Date|Ngày kết thúc/i).fill("2026-12-31");
    await page.getByRole("button", { name: /Create Project|Tạo dự án/i }).click();
    /* cspell:enable */

    await page.waitForURL("**/projects");
    await page
      .getByRole("main")
      .getByRole("link", { name: `Sprints E2E Project ${code}` })
      .click();
    await page.waitForURL("**/projects/*");

    const projectUrl = page.url();
    const projectId = projectUrl.split("/projects/")[1]?.split("/")[0]?.split("?")[0] ?? "";

    // 2. Navigate to Sprints page
    await page.goto(`/projects/${projectId}/sprints`);
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
    /* cspell:disable */
    await expect(page.getByTestId("sprint-completion")).toHaveText(/No tasks|Chưa có công việc/i);

    // 5. Edit sprint
    await page.getByRole("button", { name: /Edit|Chỉnh sửa/i }).click();
    /* cspell:enable */
    await expect(page.getByTestId("edit-sprint-form")).toBeVisible();
    await page.getByTestId("edit-sprint-name-input").fill("Sprint 1 Renamed");
    await page.getByTestId("edit-sprint-submit-btn").click();

    await expect(page.getByTestId("sprint-name")).toHaveText("Sprint 1 Renamed");

    // 6. Create a task and assign it to the sprint
    await page.goto(`/projects/${projectId}`);
    await page.waitForURL(`**/projects/${projectId}`);

    await page.getByTestId("create-task-button").click();
    await page.getByTestId("task-title-input").fill("Task in Sprint 1");
    await page.getByTestId("task-submit-button").click();

    await expect(page.getByTestId("tasks-table")).toBeVisible();
    await page.getByRole("link", { name: "Task in Sprint 1" }).click();
    await page.waitForURL("**/tasks/*");

    // Open task edit form and link to sprint
    await page.getByTestId("edit-task-button").click();
    await expect(page.getByTestId("edit-task-form")).toBeVisible();
    await page.getByTestId("edit-sprint-select").selectOption({ label: "Sprint 1 Renamed" });
    await page.getByTestId("save-task-button").click();

    await expect(page.getByTestId("sidebar-sprint")).toHaveText("Sprint 1 Renamed");

    // 7. Verify Sprints page reflects task completion rate: 0% (0/1 done)
    await page.goto(`/projects/${projectId}/sprints`);
    await page.waitForURL("**/sprints");
    await expect(page.getByTestId("sprint-completion")).toContainText("0%");
    /* cspell:disable */
    await expect(page.getByTestId("sprint-completion")).toContainText(/0\/1 (done|hoàn thành)/i);

    // 8. Archive the sprint
    await page.getByRole("button", { name: /Archive|Lưu trữ/i }).click();
    /* cspell:enable */

    // Verify sprint is removed from sprints table (empty state appears)
    await expect(page.getByTestId("empty-sprints")).toBeVisible();

    // 9. Verify task detail page shows Backlog (no sprint)
    await page.goto(`/projects/${projectId}`);
    await page.waitForURL(`**/projects/${projectId}`);
    await page.getByRole("link", { name: "Task in Sprint 1" }).click();
    await page.waitForURL("**/tasks/*");

    await expect(page.getByTestId("sidebar-sprint")).toHaveText("Backlog");
  });
});
