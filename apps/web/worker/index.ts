import { createRequestHandler, RouterContextProvider } from "react-router";

import { authService } from "../app/services/auth/auth.service";
import { runScheduledTick } from "../app/services/scheduled.service";
import { taskStatusService } from "../app/services/taskStatus.service";
import { createRequestContext, requestContextKey } from "../app/utils/requestContext.server";

export { UserNotificationHub } from "./notificationHub";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export function scheduledHandler(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
  const now = new Date(controller.scheduledTime);
  // Hourly steps first, then the outbox sweep; each step is isolated (scheduled.service.ts).
  ctx.waitUntil(runScheduledTick(env, now));
}

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    const reqCtx = createRequestContext(env, ctx, request);
    context.set(requestContextKey, reqCtx);
    ctx.waitUntil(authService.seedAdminUser(reqCtx));
    ctx.waitUntil(taskStatusService.seedDefaultStatuses(reqCtx));
    return requestHandler(request, context);
  },

  scheduled(controller, env, ctx) {
    scheduledHandler(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
