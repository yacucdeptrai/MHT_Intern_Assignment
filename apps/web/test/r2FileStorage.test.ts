import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { R2FileStorage } from "../app/services/storage/r2FileStorage.server";

const storage = new R2FileStorage(env.FILES);
const KEY = "projects/p1/tasks/t1/a1";

describe("R2FileStorage", () => {
  it("stores and reads back bytes with their content type", async () => {
    await storage.put(KEY, "hello attachment", { contentType: "text/plain" });

    const stored = await storage.get(KEY);
    expect(stored?.contentType).toBe("text/plain");
    expect(stored?.size).toBe(16);
    expect(await new Response(stored?.body).text()).toBe("hello attachment");
  });

  it("returns null for a missing key", async () => {
    expect(await storage.get("projects/p1/tasks/t1/missing")).toBeNull();
  });

  it("deletes objects, and deleting a missing key is not an error", async () => {
    await storage.put(KEY, new Uint8Array([1, 2, 3]), { contentType: "application/octet-stream" });
    await storage.delete(KEY);
    expect(await storage.get(KEY)).toBeNull();
    await expect(storage.delete(KEY)).resolves.toBeUndefined();
  });
});

describe("R2FileStorage defaults", () => {
  it("reports a generic content type when the object has none", async () => {
    await env.FILES.put("projects/p1/tasks/t1/raw", "raw bytes");
    expect((await storage.get("projects/p1/tasks/t1/raw"))?.contentType).toBe("application/octet-stream");
  });
});
