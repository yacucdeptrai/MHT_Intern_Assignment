import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createDatabase, userRepository } from "@pm/db";
import type { FileStorage, StoredFile } from "@pm/domain";
import { action as avatarAction, loader as avatarLoader } from "../../app/routes/api.avatars.$userId";
import type { RequestContext } from "../../app/utils/requestContext.server";
import { requestContextKey } from "../../app/utils/requestContext.server";
import { commitSession, getSession } from "../../app/utils/session.server";

function createMockStorage(): FileStorage & { files: Map<string, { body: Uint8Array; contentType: string }> } {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    files,
    async put(key, body, options) {
      let bytes: Uint8Array;
      if (typeof body === "string") {
        bytes = new TextEncoder().encode(body);
      } else if (body instanceof ArrayBuffer) {
        bytes = new Uint8Array(body);
      } else if (body instanceof Uint8Array) {
        bytes = body;
      } else {
        const chunks: Uint8Array[] = [];
        const reader = body.getReader();
        let chunk = await reader.read();
        while (!chunk.done) {
          chunks.push(chunk.value);
          chunk = await reader.read();
        }
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
      }
      files.set(key, { body: bytes, contentType: options.contentType });
    },
    async get(key): Promise<StoredFile | null> {
      const found = files.get(key);
      if (!found) return null;
      return Promise.resolve({
        key,
        size: found.body.length,
        contentType: found.contentType,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(found.body);
            controller.close();
          },
        }),
      });
    },
    async delete(key) {
      files.delete(key);
      await Promise.resolve();
    },
  };
}

async function createAvatarTestContext(options?: { avatarKey?: string; unauthenticated?: boolean }): Promise<{
  ctx: RequestContext;
  userId: string;
  cookieHeader: string;
  storage: ReturnType<typeof createMockStorage>;
}> {
  const db = createDatabase(env.DB);
  const now = new Date();
  const userId = crypto.randomUUID();
  const email = `avatar-test-${userId.slice(0, 6)}@example.com`;
  const storage = createMockStorage();

  if (options?.avatarKey) {
    storage.files.set(options.avatarKey, {
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/png",
    });
  }

  await userRepository.insert(db, {
    id: userId,
    email,
    fullName: "Avatar Test User",
    avatarKey: options?.avatarKey ?? null,
    systemRole: "MEMBER",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  let cookieHeader = "";
  if (!options?.unauthenticated) {
    const session = await getSession(new Request("http://localhost:5173"), env.SESSION_SECRET);
    session.set("userId", userId);
    cookieHeader = await commitSession(session, { secret: env.SESSION_SECRET, secure: false });
  }

  const ctx: RequestContext = {
    env,
    db,
    storage,
    user: null,
    requestId: "test-avatar-req",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    waitUntil: () => {},
    clock: { now: () => new Date() },
  };

  return { ctx, userId, cookieHeader, storage };
}

function makeArgs(request: Request, ctx: RequestContext, params: Record<string, string>) {
  const contextMap = new Map();
  contextMap.set(requestContextKey, ctx);
  return {
    context: contextMap,
    params,
    request,
  };
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe("api.avatars.$userId route", () => {
  describe("loader (GET)", () => {
    it("redirects unauthenticated caller to login", async () => {
      const { ctx, userId } = await createAvatarTestContext({ unauthenticated: true });
      const request = new Request(`http://localhost:5173/api/avatars/${userId}`);

      await expect(
        avatarLoader(makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarLoader>[0]),
      ).rejects.toMatchObject({ status: 302 });
    });

    it("returns 404 for non-existent user", async () => {
      const { ctx, cookieHeader } = await createAvatarTestContext();
      const request = new Request("http://localhost:5173/api/avatars/non-existent-user", {
        headers: { Cookie: cookieHeader },
      });

      const response = await avatarLoader(
        makeArgs(request, ctx, { userId: "non-existent-user" }) as unknown as Parameters<typeof avatarLoader>[0],
      );

      expect(response.status).toBe(404);
    });

    it("returns stored avatar image when present", async () => {
      const avatarKey = "avatars/test-key";
      const { ctx, userId, cookieHeader } = await createAvatarTestContext({ avatarKey });
      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        headers: { Cookie: cookieHeader },
      });

      const response = await avatarLoader(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarLoader>[0],
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("returns default SVG fallback when user has no avatarKey", async () => {
      const { ctx, userId, cookieHeader } = await createAvatarTestContext();
      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        headers: { Cookie: cookieHeader },
      });

      const response = await avatarLoader(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarLoader>[0],
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
      const text = await response.text();
      expect(text).toContain("<svg");
    });
  });

  describe("action (POST)", () => {
    it("returns 403 when trying to upload avatar for another user", async () => {
      const { ctx, cookieHeader } = await createAvatarTestContext();
      const formData = new FormData();
      formData.append("file", new File(["png-bytes"], "avatar.png", { type: "image/png" }));

      const request = new Request("http://localhost:5173/api/avatars/other-user", {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      });

      const response = await avatarAction(
        makeArgs(request, ctx, { userId: "other-user" }) as unknown as Parameters<typeof avatarAction>[0],
      );

      expect(response.status).toBe(403);
    });

    it("returns 400 when file is missing", async () => {
      const { ctx, userId, cookieHeader } = await createAvatarTestContext();
      const formData = new FormData();

      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      });

      const response = await avatarAction(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarAction>[0],
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 when file format is not PNG, JPEG, or WebP", async () => {
      const { ctx, userId, cookieHeader } = await createAvatarTestContext();
      const formData = new FormData();
      formData.append("file", new File(["hello"], "document.pdf", { type: "application/pdf" }));

      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      });

      const response = await avatarAction(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarAction>[0],
      );

      expect(response.status).toBe(400);
      const json: { success: boolean; errors?: { file?: string[] } } = await response.json();
      expect(json.errors?.file).toBeDefined();
    });

    it("returns 400 when a file declared as PNG is not an image", async () => {
      const { ctx, userId, cookieHeader, storage } = await createAvatarTestContext();
      const formData = new FormData();
      formData.append("file", new File(["<html><script>alert(1)</script>"], "avatar.png", { type: "image/png" }));

      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      });

      const response = await avatarAction(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarAction>[0],
      );

      expect(response.status).toBe(400);
      expect(storage.files.has(`avatars/${userId}`)).toBe(false);
    });

    it("successfully uploads valid PNG avatar and stores in R2", async () => {
      const { ctx, userId, cookieHeader, storage } = await createAvatarTestContext();
      const formData = new FormData();
      formData.append("file", new File([PNG_BYTES], "avatar.png", { type: "image/png" }));

      const request = new Request(`http://localhost:5173/api/avatars/${userId}`, {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      });

      const response = await avatarAction(
        makeArgs(request, ctx, { userId }) as unknown as Parameters<typeof avatarAction>[0],
      );

      expect(response.status).toBe(200);
      const json: { success: boolean; avatarUrl?: string } = await response.json();
      expect(json.success).toBe(true);
      expect(json.avatarUrl).toBe(`/api/avatars/${userId}`);

      expect(storage.files.has(`avatars/${userId}`)).toBe(true);
      const dbUser = await userRepository.findById(ctx.db, userId);
      expect(dbUser?.avatarKey).toBe(`avatars/${userId}`);
    });
  });
});
