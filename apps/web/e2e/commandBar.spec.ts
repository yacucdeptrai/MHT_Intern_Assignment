import { expect, test } from "@playwright/test";

import { setupProjectWithTask, signInAsAdmin } from "./helpers";

test.describe("Command bar (⌘K)", () => {
  test("finds a project task, switches view, and quick-adds a task that opens in the drawer", async ({ browser }) => {
    test.setTimeout(60_000);
    const { projectId } = await setupProjectWithTask(browser, { taskTitle: "Command bar search target" });

    const context = await browser.newContext();
    const page = await context.newPage();
    await signInAsAdmin(page);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("tasks-table")).toContainText("Command bar search target");

    // Tasks group: typing filters the project's tasks; Enter on the match opens its drawer
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("command-bar")).toBeVisible();
    await page.getByTestId("command-input").fill("search target");
    const taskOption = page.getByTestId("command-bar").getByText("Command bar search target");
    await expect(taskOption).toBeVisible();
    await taskOption.click();
    await page.waitForURL(`**/projects/${projectId}/tasks/*`);
    await expect(page.getByTestId("task-title")).toHaveText("Command bar search target");

    // Commands: switch the project to Board view
    // The docked drawer covers the topbar (as in the kit), so open the bar from the keyboard
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("command-input").fill("board view");
    await page.getByTestId("command-bar").getByText("Switch to Board view").click();
    await page.waitForURL(`**/projects/${projectId}?view=board`);

    // Quick-add: the typed text becomes the title, the first row creates it in this project
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("command-input").fill("Quick added from command bar");
    await expect(page.getByTestId("command-bar")).toContainText("Create task: ");
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/projects/${projectId}/tasks/*`);
    await expect(page.getByTestId("task-title")).toHaveText("Quick added from command bar");

    await context.close();
  });

  test("a search with no matches leaves only the quick-add row", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("command-input").fill("zz-no-such-thing-zz");
    // Only the quick-add row remains; no navigation or task matches
    await expect(page.getByTestId("command-bar").getByRole("option")).toHaveCount(1);
  });
});
