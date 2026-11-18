import { DurableObject } from "cloudflare:workers";

import type { NotificationDto } from "@pm/domain";

/**
 * One instance per user; holds that user's WebSocket connections (docs/07 §4).
 * Uses the WebSocket Hibernation API so idle connections cost zero duration charges.
 */
export class UserNotificationHub extends DurableObject<Env> {
  override fetch(request: Request): Response {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(JSON.stringify({ type: "ping" }), JSON.stringify({ type: "pong" })),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  publish(dto: NotificationDto): void {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({ type: "notification", notification: dto });
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // Socket closed or dead; hibernation will reap on close
      }
    }
  }

  publishUnreadCount(count: number): void {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({ type: "unreadCount", count });
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // Socket closed or dead
      }
    }
  }

  override webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    // Client-to-server messaging is ping only, handled by auto-response without waking the DO.
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    try {
      ws.close(code, reason);
    } catch {
      // Socket already closed
    }
  }

  override webSocketError(ws: WebSocket, _error: unknown): void {
    try {
      ws.close(1011, "WebSocket error");
    } catch {
      // Socket already closed
    }
  }
}
