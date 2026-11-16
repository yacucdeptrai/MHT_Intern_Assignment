import { createRequestHandler } from "react-router";

export { UserNotificationHub } from "./notificationHub";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  async fetch(request) {
    return requestHandler(request);
  },

  // The outbox sweep and deadline scan are wired in roadmap task M7-T1 (docs/07 §2).
  async scheduled() {
    // Intentionally empty until M7-T1.
  },
} satisfies ExportedHandler<Env>;
