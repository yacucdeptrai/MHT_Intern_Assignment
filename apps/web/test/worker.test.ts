import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { loader as healthLoader } from "../app/routes/api.health";

describe("GET /api/health", () => {
  it("reports ok with the environment name when D1 answers", async () => {
    const response = await healthLoader();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, environment: "local" });
  });
});

describe("UserNotificationHub (M6-T2)", () => {
  it("is bound and requires Upgrade: websocket", async () => {
    const hub = env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName("user-1"));

    const response = await hub.fetch("https://hub/connect");

    expect(response.status).toBe(426);
  });
});
