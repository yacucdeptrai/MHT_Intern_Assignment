import { expect, test } from "@playwright/test";

import { createSignedInMember, setupProjectWithTask } from "./helpers";

test.describe("Task Attachments Journey (FR-18)", () => {
  test("FR-18 c1..c4: uploads file, verifies download headers and visibility, blocks non-uploader delete, and allows uploader delete", async ({
    browser,
  }) => {
    test.slow();
    const uploader = await createSignedInMember(browser, "MEMBER");
    const bystander = await createSignedInMember(browser, "MEMBER");
    const outsider = await createSignedInMember(browser, "MEMBER");

    const { taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Attachment Journey Task",
      members: [
        { user: uploader, projectRole: "MEMBER" },
        { user: bystander, projectRole: "MEMBER" },
      ],
      assignToFullNames: [uploader.fullName],
    });

    // Uploader visits task page
    await uploader.page.goto(taskUrl);
    const attachmentsSection = uploader.page.getByTestId("task-attachments-section");
    await expect(attachmentsSection).toBeVisible();
    await expect(uploader.page.getByTestId("no-attachments-msg")).toBeVisible();

    // FR-18 c1: Uploader uploads a valid attachment (PDF)
    const fileInput = uploader.page.getByTestId("attachment-file-input");
    await fileInput.setInputFiles({
      name: "guidelines.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 sample pdf content"),
    });

    await uploader.page.getByTestId("upload-attachment-btn").click();

    // Verify attachment appears in the list
    const attachmentItem = attachmentsSection.locator('[data-testid^="attachment-item-"]');
    await expect(attachmentItem).toBeVisible({ timeout: 10000 });
    await expect(attachmentItem).toContainText("guidelines.pdf");
    await expect(attachmentItem).toContainText(uploader.fullName);

    // Extract attachment ID from download link
    const downloadLink = attachmentsSection.locator('[data-testid^="attachment-download-"]');
    const downloadHref = (await downloadLink.getAttribute("href")) ?? "";
    expect(downloadHref).toContain("/api/attachments/");

    // FR-18 c3: Uploader downloads attachment -> 200 with Content-Disposition: attachment
    const downloadResponse = await uploader.page.request.get(downloadHref);
    expect(downloadResponse.status()).toBe(200);
    expect(downloadResponse.headers()["content-disposition"]).toContain("attachment");
    expect(downloadResponse.headers()["x-content-type-options"]).toBe("nosniff");

    // FR-18 c3: Outsider (non-member) requests download URL -> 404
    const outsiderResponse = await outsider.page.request.get(downloadHref);
    expect(outsiderResponse.status()).toBe(404);

    // FR-18 c4: Bystander (project member but not uploader) sees attachment but has NO delete button
    await bystander.page.goto(taskUrl);
    const bystanderSection = bystander.page.getByTestId("task-attachments-section");
    await expect(bystanderSection).toContainText("guidelines.pdf");
    const bystanderDeleteBtn = bystanderSection.locator('[data-testid^="attachment-delete-"]');
    await expect(bystanderDeleteBtn).toHaveCount(0);

    // Uploader deletes attachment -> disappears from list
    await uploader.page.bringToFront();
    const uploaderDeleteBtn = attachmentsSection.locator('[data-testid^="attachment-delete-"]');
    await expect(uploaderDeleteBtn).toBeVisible();
    await uploaderDeleteBtn.click();

    await expect(attachmentsSection.locator('[data-testid^="attachment-item-"]')).toHaveCount(0);
    await expect(uploader.page.getByTestId("no-attachments-msg")).toBeVisible();
  });
});
