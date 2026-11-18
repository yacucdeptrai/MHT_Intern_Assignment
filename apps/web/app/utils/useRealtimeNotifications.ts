import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const PING_INTERVAL_MS = 30000;

/**
 * Client-side hook for realtime notifications over WebSocket (FR-26 c1..c3, docs/07 §4).
 * Connects to /api/realtime, reconnects on drop with exponential backoff (1s, 2s, 4s... max 30s),
 * re-fetches unread notifications on reconnect, and triggers revalidation on incoming notifications.
 */
export function useRealtimeNotifications(enabled = true) {
  const revalidator = useRevalidator();
  // useRevalidator() returns a new object whenever its state changes. Reading it through a ref keeps
  // the effect below from re-running (and tearing down the socket) after every revalidation.
  const revalidatorRef = useRef(revalidator);
  useEffect(() => {
    revalidatorRef.current = revalidator;
  }, [revalidator]);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnectingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let isDisposed = false;
    let ws: WebSocket | null = null;

    function scheduleReconnect() {
      if (isDisposed || reconnectTimeoutRef.current) {
        return;
      }

      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, delay);
    }

    function connect() {
      if (isDisposed) {
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/realtime`;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (isDisposed) {
          ws?.close();
          return;
        }

        // On reconnect: refetch unread notifications so missed events during drop are updated (FR-26 c2)
        if (isReconnectingRef.current) {
          void revalidatorRef.current.revalidate();
          isReconnectingRef.current = false;
        }

        // Reset backoff delay
        backoffRef.current = INITIAL_BACKOFF_MS;

        // Keepalive ping answered by DO auto-response without waking the object
        pingIntervalRef.current = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              // Ignore ping error; onclose will handle reconnect
            }
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const data = JSON.parse(event.data) as { type?: unknown };
          if (data.type === "notification" || data.type === "unreadCount") {
            void revalidatorRef.current.revalidate();
          }
        } catch {
          // Ignore invalid payload
        }
      };

      ws.onclose = () => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (isDisposed) {
          return;
        }

        isReconnectingRef.current = true;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // ws.onclose will be fired automatically
      };
    }

    connect();

    return () => {
      isDisposed = true;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, [enabled]);
}
