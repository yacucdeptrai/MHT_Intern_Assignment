/** Body accepted by file storage: web-standard types only, so the port stays runtime-neutral. */
export type FileBody = ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string;

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
  body: ReadableStream<Uint8Array>;
}

/** Port for binary storage (attachments, avatars). Implemented by R2FileStorage in @pm/web. */
export interface FileStorage {
  put(key: string, body: FileBody, options: { contentType: string }): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}
