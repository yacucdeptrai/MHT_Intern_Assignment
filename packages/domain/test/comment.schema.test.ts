import { describe, expect, it } from "vitest";

import { CommentCreateSchema, CommentIdSchema } from "../src";

describe("Comment Schemas (FR-19)", () => {
  it("FR-19 c1: CommentCreateSchema trims body (1..5000 chars), preserves emoji and Vietnamese text, and normalizes empty parentCommentId to null", () => {
    const rootParsed = CommentCreateSchema.parse({
      // cspell:disable-next-line
      body: "  Xin chào đội ngũ 🚀 — tiến độ ổn định!  ",
      parentCommentId: "",
    });
    expect(rootParsed).toEqual({
      // cspell:disable-next-line
      body: "Xin chào đội ngũ 🚀 — tiến độ ổn định!",
      parentCommentId: null,
    });

    const maxBody = "a".repeat(5000);
    const replyParsed = CommentCreateSchema.parse({
      body: maxBody,
      parentCommentId: "parent-comment-123",
    });
    expect(replyParsed.body).toHaveLength(5000);
    expect(replyParsed.parentCommentId).toBe("parent-comment-123");
  });

  it("FR-19 c1: CommentCreateSchema rejects empty, whitespace-only, or >5000-character body", () => {
    expect(CommentCreateSchema.safeParse({ body: "" }).success).toBe(false);
    expect(CommentCreateSchema.safeParse({ body: "    " }).success).toBe(false);
    expect(CommentCreateSchema.safeParse({ body: "a".repeat(5001) }).success).toBe(false);
  });

  it("FR-19 c3: CommentIdSchema requires non-empty commentId", () => {
    expect(CommentIdSchema.parse({ commentId: "c-1" })).toEqual({ commentId: "c-1" });
    expect(CommentIdSchema.safeParse({ commentId: "" }).success).toBe(false);
    expect(CommentIdSchema.safeParse({ commentId: "   " }).success).toBe(false);
  });
});
