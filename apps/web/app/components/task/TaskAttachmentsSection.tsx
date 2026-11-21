import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher, useRevalidator } from "react-router";

import type { AttachmentDto } from "@pm/domain";

import { formatShortDate } from "../../utils/format";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";

export interface TaskAttachmentsSectionProps {
  projectId: string;
  taskId: string;
  attachments: AttachmentDto[];
  canAttach: boolean;
  isSubmitting?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadResponse {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  data?: AttachmentDto;
}

/** Files tab: attachment cards and a dashed upload zone (10 MB limit). */
export function TaskAttachmentsSection({
  projectId,
  taskId,
  attachments,
  canAttach,
  isSubmitting = false,
}: TaskAttachmentsSectionProps) {
  const { t, i18n } = useTranslation();
  const fetcher = useFetcher<UploadResponse>();
  const revalidator = useRevalidator();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

  const [prevData, setPrevData] = useState(fetcher.data);
  if (fetcher.data !== prevData) {
    setPrevData(fetcher.data);
    if (fetcher.data?.success) {
      setSelectedName(null);
    }
  }

  const errorMessage = fetcher.data && !fetcher.data.success ? (fetcher.data.message ?? null) : null;
  const isUploading = fetcher.state !== "idle";

  return (
    <section className="flex flex-col gap-2" data-testid="task-attachments-section">
      {errorMessage ? (
        <Banner tone="danger" role="alert" data-testid="attachment-upload-error">
          {errorMessage}
        </Banner>
      ) : null}

      {attachments.length === 0 ? (
        <span className="text-[12.5px] leading-[1.4] text-fg-muted" data-testid="no-attachments-msg">
          {t("task_attachments.no_attachments")}
        </span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="attachments-list">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-2"
              data-testid={`attachment-item-${att.id}`}
            >
              <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md bg-muted text-fg-muted">
                <Icon name="paperclip" size={14} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <a
                  href={`/api/attachments/${att.id}?projectId=${projectId}`}
                  download={att.fileName}
                  className="truncate text-[13px] font-medium leading-[1.2] text-fg no-underline hover:underline"
                  data-testid={`attachment-download-${att.id}`}
                >
                  {att.fileName}
                </a>
                <span className="text-[11.5px] leading-[1.2] text-fg-muted">
                  {t("task_attachments.uploaded_by", {
                    size: formatFileSize(att.sizeBytes),
                    uploader: att.uploaderName,
                    date: formatShortDate(new Date(att.createdAt), i18n.language),
                  })}
                </span>
              </span>
              {att.canDelete ? (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="deleteAttachment" />
                  <input type="hidden" name="attachmentId" value={att.id} />
                  <IconButton
                    type="submit"
                    icon="trash-2"
                    label={t("task_attachments.btn_delete")}
                    size="xs"
                    disabled={isSubmitting}
                    data-testid={`attachment-delete-${att.id}`}
                  />
                </Form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAttach ? (
        <fetcher.Form
          method="post"
          action="/api/attachments/upload"
          encType="multipart/form-data"
          className="flex flex-col gap-2"
          data-testid="attachment-upload-form"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <label className="relative flex h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-[12.5px] leading-none text-fg-muted hover:bg-hover">
            <Icon name="upload" size={15} />
            {selectedName ?? t("task_attachments.drop_hint")}
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              disabled={isUploading}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => {
                setSelectedName(event.target.files?.[0]?.name ?? null);
              }}
              data-testid="attachment-file-input"
            />
          </label>
          {selectedName ? (
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                icon="upload"
                disabled={isUploading}
                data-testid="upload-attachment-btn"
              >
                {isUploading ? t("task_attachments.uploading") : t("task_attachments.upload_file")}
              </Button>
            </div>
          ) : null}
        </fetcher.Form>
      ) : null}
    </section>
  );
}
