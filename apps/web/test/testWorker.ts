// Minimal Worker entry for the web test project; tests call services and bindings directly.
// Durable Object classes must be exported from the entry that the test runtime loads.
export { UserNotificationHub } from "../worker/notificationHub";

export default {
  fetch() {
    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler<Env>;
