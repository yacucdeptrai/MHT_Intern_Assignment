import { useEffect, useRef } from "react";
import { Form, useFetcher, useRevalidator } from "react-router";

import type { AttachmentDto } from "@pm/domain";

import { formatAuditTimestamp } from "../../utils/formatAudit";

export interface TaskAttachmentsSectionProps {
  projectId: string;
  taskId: string;
  attachments: AttachmentDto[];
  canAttach: boolean;
  isSubmitting?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface UploadResponse {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  data?: AttachmentDto;
}

export function TaskAttachmentsSection({
  projectId,
  taskId,
  attachments,
  canAttach,
  isSubmitting = false,
}: TaskAttachmentsSectionProps) {
  const fetcher = useFetcher<UploadResponse>();
  const revalidator = useRevalidator();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

  const errorMessage = fetcher.data && !fetcher.data.success ? (fetcher.data.message ?? null) : null;

  const isUploading = fetcher.state !== "idle";

  return (
    <section
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      data-testid="task-attachments-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Attachments <span className="text-sm font-normal text-gray-500">({attachments.length})</span>
        </h2>
      </div>

      {canAttach ? (
        <fetcher.Form
          method="post"
          action="/api/attachments/upload"
          encType="multipart/form-data"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-300 p-4 bg-gray-50"
          data-testid="attachment-upload-form"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />

          <input
            ref={fileInputRef}
            type="file"
            name="file"
            disabled={isUploading}
            className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
            data-testid="attachment-file-input"
          />

          <button
            type="submit"
            disabled={isUploading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            data-testid="upload-attachment-btn"
          >
            {isUploading ? "Uploading..." : "Upload File"}
          </button>
        </fetcher.Form>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" data-testid="attachment-upload-error">
          {errorMessage}
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="no-attachments-msg">
          No attachments uploaded yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100" data-testid="attachments-list">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              data-testid={`attachment-item-${att.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg
                  className="h-6 w-6 flex-shrink-0 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>

                <div className="min-w-0">
                  <a
                    href={`/api/attachments/${att.id}?projectId=${projectId}`}
                    download={att.fileName}
                    className="block truncate text-sm font-medium text-blue-600 hover:underline"
                    data-testid={`attachment-download-${att.id}`}
                  >
                    {att.fileName}
                  </a>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(att.sizeBytes)} • Uploaded by {att.uploaderName} •{" "}
                    {formatAuditTimestamp(att.createdAt)}
                  </p>
                </div>
              </div>

              {att.canDelete ? (
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="deleteAttachment" />
                  <input type="hidden" name="attachmentId" value={att.id} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    data-testid={`attachment-delete-${att.id}`}
                  >
                    Delete
                  </button>
                </Form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
