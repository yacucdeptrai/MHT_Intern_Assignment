export interface AttachmentDto {
  id: string;
  taskId: string;
  uploadedById: string;
  uploaderName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  canDelete: boolean;
  createdAt: number;
}

export interface AttachmentUploadInput {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  size: number;
}
