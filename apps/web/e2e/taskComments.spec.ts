import { expect, test } from "@playwright/test";

import { createSignedInMember, moveTaskToStatus, setupProjectWithTask } from "./helpers";

test.describe("Task Threaded Comments Journey (FR-19)", () => {
  test("FR-19 c1..c3: shows rejection reason as root comment, keeps replies one level deep, blocks non-author delete (403), and preserves replies when root is deleted", async ({
    browser,
  }) => {
    // Several signed-in users plus reload-heavy steps run past the 90 s slow() budget.
    test.setTimeout(150_000);
    const lead = await createSignedInMember(browser, "TEAM_LEAD");
    const author = await createSignedInMember(browser, "MEMBER");
    const bystander = await createSignedInMember(browser, "MEMBER");

    const { taskUrl } = await setupProjectWithTask(browser, {
      taskTitle: "Threaded Comments Task",
      members: [
        { user: lead, projectRole: "TEAM_LEAD" },
        { user: author, projectRole: "MEMBER" },
        { user: bystander, projectRole: "MEMBER" },
      ],
      assignToFullNames: [author.fullName],
    });

    // Lead rejects task in Review -> rejection reason saved as root comment (M4-T3 / FR-23 c1)
    await author.page.goto(taskUrl);
    await moveTaskToStatus(author.page, "Review");

    const rejectionReason = "Please verify edge-case inputs before approval";
    await lead.page.goto(taskUrl);
    await lead.page.getByTestId("reject-task-button").click();
    await lead.page.getByTestId("input-task-reason").fill(rejectionReason);
    await lead.page.getByTestId("submit-reason-button").click();
    await expect(lead.page.getByTestId("task-status-badge")).toHaveText("In Progress");

    // Author reloads and sees the rejection reason inside the Comments thread
    await author.page.reload();
    await author.page.getByTestId("drawer-tab-activity").click();
    const commentsSection = author.page.getByTestId("comments-section");
    await expect(commentsSection).toContainText(rejectionReason);

    // Empty comment validation -> 400 error message shown
    await author.page.getByTestId("submit-comment-button").click();
    await expect(author.page.getByTestId("error-comment-body")).toHaveText("Comment cannot be empty");

    // FR-19 c1: Author posts a root comment (with Vietnamese + emoji)
    // cspell:disable-next-line
    const rootText = "Đã bổ sung kiểm thử biên đầy đủ 🚀";
    await author.page.getByTestId("input-comment-body").fill(rootText);
    await author.page.getByTestId("submit-comment-button").click();
    await expect(commentsSection).toContainText(rootText);
    await expect(author.page.getByTestId("input-comment-body")).toHaveValue("");

    // Locate the newly created root comment ID from its testid attribute
    const rootCard = commentsSection.locator('[data-testid^="comment-item-"]', { hasText: rootText });
    const rootTestId = (await rootCard.getAttribute("data-testid")) ?? "";
    const rootId = rootTestId.replace("comment-item-", "");
    expect(rootId.length).toBeGreaterThan(0);

    // FR-19 c2: Bystander posts a direct reply to Author's root comment
    await bystander.page.goto(taskUrl);
    await bystander.page.getByTestId("drawer-tab-activity").click();
    await bystander.page.getByTestId(`reply-comment-btn-${rootId}`).click();
    const directReplyText = "Looks great, checking locally now.";
    await bystander.page.getByTestId("input-reply-body").fill(directReplyText);
    await bystander.page.getByTestId("submit-reply-button").click();

    const repliesContainer = bystander.page.getByTestId(`comment-replies-${rootId}`);
    await expect(repliesContainer).toContainText(directReplyText);

    const directReplyCard = repliesContainer.locator('[data-testid^="comment-item-"]', {
      hasText: directReplyText,
    });
    const directReplyTestId = (await directReplyCard.getAttribute("data-testid")) ?? "";
    const directReplyId = directReplyTestId.replace("comment-item-", "");

    // FR-19 c2: Lead replies to Bystander's reply -> stays one level deep under rootId
    await lead.page.reload();
    await lead.page.getByTestId("drawer-tab-activity").click();
    await lead.page.getByTestId(`reply-comment-btn-${directReplyId}`).click();
    const nestedReplyText = "Confirmed, ready to move back to Review.";
    await lead.page.getByTestId("input-reply-body").fill(nestedReplyText);
    await lead.page.getByTestId("submit-reply-button").click();

    const leadRepliesContainer = lead.page.getByTestId(`comment-replies-${rootId}`);
    await expect(leadRepliesContainer).toContainText(directReplyText);
    await expect(leadRepliesContainer).toContainText(nestedReplyText);

    // FR-19 c3: Bystander cannot delete Author's root comment (no button + 403 on direct POST)
    await bystander.page.reload();
    await bystander.page.getByTestId("drawer-tab-activity").click();
    await expect(bystander.page.getByTestId(`delete-comment-btn-${rootId}`)).toHaveCount(0);
    const forbiddenDeleteRes = await bystander.page.request.post(taskUrl, {
      form: { intent: "deleteComment", commentId: rootId },
    });
    expect(forbiddenDeleteRes.status()).toBe(403);

    // FR-19 c3: Author deletes root comment -> shows "Comment deleted" while both replies remain visible
    await author.page.reload();
    await author.page.getByTestId("drawer-tab-activity").click();
    await author.page.getByTestId(`delete-comment-btn-${rootId}`).click();
    await expect(author.page.getByTestId(`comment-deleted-${rootId}`)).toHaveText("Comment deleted");
    await expect(author.page.getByTestId(`comment-body-${rootId}`)).toHaveCount(0);

    const authorRepliesContainer = author.page.getByTestId(`comment-replies-${rootId}`);
    await expect(authorRepliesContainer).toContainText(directReplyText);
    await expect(authorRepliesContainer).toContainText(nestedReplyText);

    await lead.context.close();
    await author.context.close();
    await bystander.context.close();
  });
});
