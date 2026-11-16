import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { userRepository } from "@pm/db";
import type { AllowedAvatarMimeType } from "@pm/domain";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES, ValidationError } from "@pm/domain";

import { profileService } from "../services/user/profile.service";
import { R2FileStorage } from "../services/storage/r2FileStorage.server";
import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#94a3b8"/><circle cx="50" cy="40" r="20" fill="#ffffff"/><path d="M 20 85 C 20 65, 80 65, 80 85 Z" fill="#ffffff"/></svg>`;

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);
  await requireUser(ctx, request);

  const userId = params.userId;
  if (!userId) {
    return new Response("User ID is required", { status: 400 });
  }

  const user = await userRepository.findById(ctx.db, userId);
  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  if (user.avatarKey) {
    const storage = ctx.storage ?? new R2FileStorage(ctx.env.FILES);
    const stored = await storage.get(user.avatarKey);
    if (stored) {
      return new Response(stored.body, {
        status: 200,
        headers: {
          "Content-Type": stored.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new Response(DEFAULT_AVATAR_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function action({ context, params, request }: ActionFunctionArgs) {
  const ctx = context.get(requestContextKey);
  const sessionUser = await requireUser(ctx, request);

  const userId = params.userId;
  if (!userId || sessionUser.id !== userId) {
    return Response.json({ success: false, errors: { form: ["Forbidden"] } }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return Response.json({ success: false, errors: { file: ["Please select an image file"] } }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return Response.json({ success: false, errors: { file: ["Avatar must be at most 10 MB"] } }, { status: 400 });
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as AllowedAvatarMimeType)) {
    return Response.json(
      { success: false, errors: { file: ["Avatar must be a PNG, JPEG, or WebP image"] } },
      { status: 400 },
    );
  }

  try {
    const result = await profileService.updateAvatar(ctx, sessionUser.id, {
      bytes: file.stream(),
      contentType: file.type,
      size: file.size,
    });

    return Response.json({ success: true, avatarUrl: `/api/avatars/${sessionUser.id}`, avatarKey: result.avatarKey });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return Response.json({ success: false, errors: err.fieldErrors ?? { form: [err.message] } }, { status: 400 });
    }
    throw err;
  }
}
