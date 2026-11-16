import type { FileBody, FileStorage, StoredFile } from "@pm/domain";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** FileStorage backed by an R2 bucket binding (`FILES`). Objects are never public; reads go through authorized routes. */
export class R2FileStorage implements FileStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: FileBody, options: { contentType: string }): Promise<void> {
    await this.bucket.put(key, body, { httpMetadata: { contentType: options.contentType } });
  }

  async get(key: string): Promise<StoredFile | null> {
    const object = await this.bucket.get(key);
    if (object === null) return null;
    return {
      key: object.key,
      size: object.size,
      contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
      // R2 types its stream as ReadableStream<any>; a pass-through re-types it without an unchecked cast.
      body: object.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>()),
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
