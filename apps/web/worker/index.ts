import { createRequestHandler, RouterContextProvider } from "react-router";

import { createRequestContext, requestContextKey } from "../app/utils/requestContext.server";

export { UserNotificationHub } from "./notificationHub";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(requestContextKey, createRequestContext(env, ctx, request));
    return requestHandler(request, context);
  },

  // The outbox sweep and deadline scan are wired in roadmap task M7-T1 (docs/07 §2).
  async scheduled() {
    // Intentionally empty until M7-T1.
  },
} satisfies ExportedHandler<Env>;
