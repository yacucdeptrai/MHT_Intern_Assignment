import { createRequestHandler, RouterContextProvider } from "react-router";

import { authService } from "../app/services/auth/auth.service";
import { sweepOutbox } from "../app/services/outbox.service";
import { taskStatusService } from "../app/services/taskStatus.service";
import { createRequestContext, requestContextKey } from "../app/utils/requestContext.server";

export { UserNotificationHub } from "./notificationHub";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export function scheduledHandler(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
  const now = new Date(controller.scheduledTime);
  ctx.waitUntil(
    (async () => {
      if (now.getUTCMinutes() === 0) {
        // Hourly tasks run first, in sequence:
        // M7-T4: await runDeadlineScan(env, now);
        // M7-T5: await sweepOrphanFiles(env, now);
        // M7-T5: await cleanupExpiredInvites(env, now);
      }
      await sweepOutbox(env, now);
    })(),
  );
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
