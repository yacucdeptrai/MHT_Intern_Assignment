import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { CommentDto, CommentThread } from "@pm/domain";

import { formatRelativeTime } from "../../utils/format";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";

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
  /** Name shown beside the composer */
  currentUserName?: string;
}

interface CommentCardProps {
  item: CommentDto;
  canComment: boolean;
  isSubmitting: boolean;
  onReplyClick: (commentId: string) => void;
}

/** Avatar + bordered card: author · time, body, reply / delete actions. */
function CommentCard({ item, canComment, isSubmitting, onReplyClick }: CommentCardProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex gap-2" data-testid={`comment-item-${item.id}`}>
      <Avatar name={item.authorName} size={20} />
      <div className="flex flex-1 flex-col gap-1 rounded-lg border border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[12.5px] font-medium leading-none text-fg">
            {item.authorName}{" "}
            <span className="font-normal text-fg-muted" suppressHydrationWarning>
              {`· ${formatRelativeTime(new Date(item.createdAt), i18n.language)}`}
            </span>
          </span>
          {canComment && !item.isDeleted ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onReplyClick(item.id);
              }}
              data-testid={`reply-comment-btn-${item.id}`}
            >
              {t("task_comments.btn_reply")}
            </Button>
          ) : null}
          {item.canDelete ? (
            <Form method="post" className="inline">
              <input type="hidden" name="intent" value="deleteComment" />
              <input type="hidden" name="commentId" value={item.id} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={isSubmitting}
                data-testid={`delete-comment-btn-${item.id}`}
              >
                {t("task_comments.btn_delete")}
              </Button>
            </Form>
          ) : null}
        </div>
        {item.isDeleted ? (
          <p className="m-0 text-[13px] italic leading-normal text-fg-muted" data-testid={`comment-deleted-${item.id}`}>
            {t("task_comments.comment_deleted")}
          </p>
        ) : (
          <p
            className="m-0 whitespace-pre-wrap text-[13px] leading-normal text-fg"
            data-testid={`comment-body-${item.id}`}
          >
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

/** Composer: borderless textarea inside a bordered box, submit bottom-right. */
function Composer({
  id,
  value,
  onChange,
  placeholder,
  label,
  error,
  errorTestId,
  inputTestId,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  error?: string | undefined;
  errorTestId: string;
  inputTestId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <div
        className={cx(
          "flex flex-col rounded-lg border bg-surface",
          error ? "border-danger" : "border-line-default focus-within:border-line-focus focus-within:shadow-focus",
        )}
      >
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          id={id}
          name="body"
          rows={2}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          className="resize-none border-0 bg-transparent px-3 py-2 text-[13px] leading-normal text-fg shadow-none outline-none placeholder:text-fg-faint focus-visible:shadow-none"
          data-testid={inputTestId}
        />
        <div className="flex items-center justify-end gap-1 px-1.5 pb-1.5">{children}</div>
      </div>
      {error ? (
        <span className="text-[11.5px] leading-[1.35] text-danger" data-testid={errorTestId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TaskCommentsSection({
  comments,
  canComment,
  isSubmitting,
  actionData,
  currentUserName = "",
}: TaskCommentsSectionProps) {
  const { t } = useTranslation();
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
    <div className="flex flex-col gap-3.5" data-testid="comments-section">
      {comments.length === 0 ? (
        <span className="text-[12.5px] leading-[1.4] text-fg-muted" data-testid="comments-empty">
          {t("task_comments.no_comments")}
        </span>
      ) : (
        <div className="flex flex-col gap-3.5" data-testid="comments-thread-list">
          {comments.map((thread) => {
            const isReplyingInThisThread =
              replyingToId === thread.root.id || thread.replies.some((reply) => reply.id === replyingToId);
            return (
              <div key={thread.root.id} className="flex flex-col gap-2" data-testid="comment-thread">
                <CommentCard
                  item={thread.root}
                  canComment={canComment}
                  isSubmitting={isSubmitting}
                  onReplyClick={handleToggleReply}
                />
                {thread.replies.length > 0 ? (
                  <div className="ml-7 flex flex-col gap-2" data-testid={`comment-replies-${thread.root.id}`}>
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
                  <Form method="post" className="ml-7 flex gap-2" data-testid="form-reply-comment">
                    <input type="hidden" name="intent" value="comment" />
                    <input type="hidden" name="parentCommentId" value={replyingToId} />
                    <Avatar name={currentUserName} size={20} />
                    <Composer
                      id={`reply-input-${thread.root.id}`}
                      value={replyDraft}
                      onChange={setReplyDraft}
                      label={t("task_comments.label_reply")}
                      placeholder={t("task_comments.placeholder_reply")}
                      error={isReplyError ? bodyErrorText : undefined}
                      errorTestId="error-reply-body"
                      inputTestId="input-reply-body"
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyingToId(null);
                        }}
                        data-testid="cancel-reply-button"
                      >
                        {t("task_comments.btn_cancel")}
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        variant={replyDraft.trim() ? "primary" : "secondary"}
                        disabled={isSubmitting}
                        data-testid="submit-reply-button"
                      >
                        {t("task_comments.btn_post_reply")}
                      </Button>
                    </Composer>
                  </Form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {canComment ? (
        <Form method="post" className="flex items-start gap-2" data-testid="form-add-comment">
          <input type="hidden" name="intent" value="comment" />
          <Avatar name={currentUserName} size={20} />
          <Composer
            id="new-comment-body"
            value={commentDraft}
            onChange={setCommentDraft}
            label={t("task_comments.label_add_comment")}
            placeholder={t("task_comments.placeholder_new_comment")}
            error={isRootError ? bodyErrorText : undefined}
            errorTestId="error-comment-body"
            inputTestId="input-comment-body"
          >
            <Button
              type="submit"
              size="sm"
              variant={commentDraft.trim() ? "primary" : "secondary"}
              disabled={isSubmitting}
              data-testid="submit-comment-button"
            >
              {t("task_comments.btn_post_comment")}
            </Button>
          </Composer>
        </Form>
      ) : null}
    </div>
  );
}
