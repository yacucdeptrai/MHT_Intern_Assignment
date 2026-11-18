import type { LoaderFunctionArgs } from "react-router";

import type { SessionUser } from "@pm/domain";

import { requireUser } from "../utils/auth.server";
import { requestContextKey } from "../utils/requestContext.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const ctx = context.get(requestContextKey);

  // 1. Authenticate with requireUser and return 401 without a session (FR-26 c3, docs/09 §3.4)
  let user: SessionUser;
  try {
    user = await requireUser(ctx, request);
  } catch (error) {
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw error;
  }

  // 2. Reject cross-origin WebSocket handshakes (Origin header checked against APP_BASE_URL)
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const allowedOrigin = new URL(ctx.env.APP_BASE_URL).origin;
      const requestUrlOrigin = new URL(request.url).origin;
      const requestOrigin = new URL(origin).origin;
      if (requestOrigin !== allowedOrigin && requestOrigin !== requestUrlOrigin) {
        return new Response("Forbidden", { status: 403 });
      }
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // 3. Verify WebSocket upgrade header
  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  // 4. Strip client-supplied user headers so the hub identifies the user ONLY from the validated session
  const headers = new Headers(request.headers);
  headers.delete("x-user-id");
  headers.delete("x-user");
  headers.delete("user-id");

  // 5. Forward to Durable Object for this user
  const hubId = ctx.env.NOTIFICATION_HUB.idFromName(user.id);
  const hub = ctx.env.NOTIFICATION_HUB.get(hubId);

  const forwardRequest = new Request(request.url, {
    method: request.method,
    headers,
  });

  return hub.fetch(forwardRequest);
}
