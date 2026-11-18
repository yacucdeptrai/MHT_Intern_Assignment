import { z } from "zod";

export const CommentCreateSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(5000, "Comment must be at most 5,000 characters"),
  parentCommentId: z
    .string()
    .trim()
    .nullish()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export type CommentCreateInput = z.input<typeof CommentCreateSchema>;
export type CommentCreateOutput = z.output<typeof CommentCreateSchema>;

export const CommentIdSchema = z.object({
  commentId: z.string().trim().min(1, "Comment ID is required"),
});

export type CommentIdInput = z.input<typeof CommentIdSchema>;
export type CommentIdOutput = z.output<typeof CommentIdSchema>;
