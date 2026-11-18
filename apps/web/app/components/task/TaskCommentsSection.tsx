import { useState } from "react";
import { Form } from "react-router";

import type { CommentDto, CommentThread } from "@pm/domain";

import { formatAuditTimestamp } from "../../utils/formatAudit";

export interface CommentActionFeedback {
  success?: boolean | undefined;
  intent?: string | undefined;
  errors?: Record<string, string[]> | undefined;
  message?: string | undefined;
  values?: Record<string, string> | undefined;
}

export interface TaskCommentsSectionProps {
  comments: CommentThread[];
  canComment: boolean;
  isSubmitting: boolean;
  actionData?: CommentActionFeedback | undefined;
}

interface CommentCardProps {
  item: CommentDto;
  canComment: boolean;
  isSubmitting: boolean;
  onReplyClick: (commentId: string) => void;
}

function CommentCard({ item, canComment, isSubmitting, onReplyClick }: CommentCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2" data-testid={`comment-item-${item.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{item.authorName}</span>
          <span className="font-mono text-xs text-gray-500">{formatAuditTimestamp(item.createdAt)}</span>
        </div>

        <div className="flex items-center gap-2">
          {canComment && !item.isDeleted ? (
            <button
              type="button"
              onClick={() => {
                onReplyClick(item.id);
              }}
              className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              data-testid={`reply-comment-btn-${item.id}`}
            >
              Reply
            </button>
          ) : null}

          {item.canDelete ? (
            <Form method="post" className="inline">
              <input type="hidden" name="intent" value="deleteComment" />
              <input type="hidden" name="commentId" value={item.id} />
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                data-testid={`delete-comment-btn-${item.id}`}
              >
                Delete
              </button>
            </Form>
          ) : null}
        </div>
      </div>

      {item.isDeleted ? (
        <p className="text-sm italic text-gray-400" data-testid={`comment-deleted-${item.id}`}>
          Comment deleted
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-gray-800" data-testid={`comment-body-${item.id}`}>
          {item.body}
        </p>
      )}
    </div>
  );
}

export function TaskCommentsSection({ comments, canComment, isSubmitting, actionData }: TaskCommentsSectionProps) {
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [prevActionData, setPrevActionData] = useState(actionData);

  if (actionData !== prevActionData) {
    setPrevActionData(actionData);
    if (actionData?.success && actionData.intent === "comment") {
      setCommentDraft("");
      setReplyDraft("");
      setReplyingToId(null);
    }
  }

  const totalCount = comments.reduce((acc, thread) => acc + 1 + thread.replies.length, 0);
  const isCommentActionError = actionData?.success === false && actionData.intent === "comment";
  const isReplyError = isCommentActionError && Boolean(actionData.values?.parentCommentId);
  const isRootError = isCommentActionError && !actionData.values?.parentCommentId;
  const bodyErrorText = actionData?.errors?.body?.join(", ") ?? actionData?.message;

  const handleToggleReply = (targetId: string) => {
    if (replyingToId === targetId) {
      setReplyingToId(null);
    } else {
      setReplyingToId(targetId);
      setReplyDraft("");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5" data-testid="comments-section">
      <h2 className="text-base font-bold text-gray-900">Comments ({totalCount})</h2>

      {comments.length === 0 ? (
        <p className="text-sm italic text-gray-500" data-testid="comments-empty">
          No comments yet.
        </p>
      ) : (
        <div className="space-y-4" data-testid="comments-thread-list">
          {comments.map((thread) => {
            const isReplyingInThisThread =
              replyingToId === thread.root.id || thread.replies.some((r) => r.id === replyingToId);

            return (
              <div key={thread.root.id} className="space-y-3" data-testid="comment-thread">
                <CommentCard
                  item={thread.root}
                  canComment={canComment}
                  isSubmitting={isSubmitting}
                  onReplyClick={handleToggleReply}
                />

                {thread.replies.length > 0 ? (
                  <div
                    className="ml-6 space-y-2 border-l-2 border-gray-200 pl-4"
                    data-testid={`comment-replies-${thread.root.id}`}
                  >
                    {thread.replies.map((reply) => (
                      <CommentCard
                        key={reply.id}
                        item={reply}
                        canComment={canComment}
                        isSubmitting={isSubmitting}
                        onReplyClick={handleToggleReply}
                      />
                    ))}
                  </div>
                ) : null}

                {canComment && isReplyingInThisThread && replyingToId ? (
                  <Form
                    method="post"
                    className="ml-6 space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3"
                    data-testid="form-reply-comment"
                  >
                    <input type="hidden" name="intent" value="comment" />
                    <input type="hidden" name="parentCommentId" value={replyingToId} />
                    <label
                      htmlFor={`reply-input-${thread.root.id}`}
                      className="block text-xs font-medium text-gray-700"
                    >
                      Reply
                    </label>
                    <textarea
                      id={`reply-input-${thread.root.id}`}
                      name="body"
                      rows={2}
                      value={replyDraft}
                      onChange={(e) => {
                        setReplyDraft(e.target.value);
                      }}
                      placeholder="Write a reply..."
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                      data-testid="input-reply-body"
                    />
                    {isReplyError && bodyErrorText ? (
                      <p className="text-xs text-red-600" data-testid="error-reply-body">
                        {bodyErrorText}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToId(null);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        data-testid="cancel-reply-button"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        data-testid="submit-reply-button"
                      >
                        Post Reply
                      </button>
                    </div>
                  </Form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {canComment ? (
        <Form method="post" className="space-y-3 border-t border-gray-100 pt-4" data-testid="form-add-comment">
          <input type="hidden" name="intent" value="comment" />
          <div>
            <label
              htmlFor="new-comment-body"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
            >
              Add a Comment
            </label>
            <textarea
              id="new-comment-body"
              name="body"
              rows={3}
              value={commentDraft}
              onChange={(e) => {
                setCommentDraft(e.target.value);
              }}
              placeholder="Share an update or ask a question..."
              className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              data-testid="input-comment-body"
            />
            {isRootError && bodyErrorText ? (
              <p className="mt-1 text-xs text-red-600" data-testid="error-comment-body">
                {bodyErrorText}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              data-testid="submit-comment-button"
            >
              Post Comment
            </button>
          </div>
        </Form>
      ) : null}
    </div>
  );
}
