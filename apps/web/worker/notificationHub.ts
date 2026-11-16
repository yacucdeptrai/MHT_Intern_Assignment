import { DurableObject } from "cloudflare:workers";

/**
 * One instance per user; holds that user's WebSocket connections (docs/07 §4).
 * Connection handling and publish() arrive in roadmap task M6-T2.
 */
export class UserNotificationHub extends DurableObject<Env> {
  override fetch(_request: Request): Response {
    return new Response("Realtime notifications are not available yet", { status: 501 });
  }
}
