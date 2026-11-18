import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { addMemberToNewProject, createSignedInMember } from "./helpers";

/** Builds close options without undefined keys (exactOptionalPropertyTypes). */
function closeOptions(code: number | undefined, reason: string | undefined): { code?: number; reason?: string } {
  return { ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) };
}

/**
 * Proxies /api/realtime through to the real server while recording connections. In development,
 * React StrictMode mounts effects twice, so a page may open and immediately close one extra socket;
 * tests therefore look at live sockets and at attempts counted from a settled baseline.
 */
async function trackRealtime(page: Page) {
  const state = { attempts: 0, refuse: false, live: new Set<WebSocketRoute>() };
  await page.routeWebSocket("**/api/realtime", (ws) => {
    state.attempts += 1;
    if (state.refuse) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    state.live.add(ws);
    ws.onClose((code, reason) => {
      state.live.delete(ws);
      void server.close(closeOptions(code, reason));
    });
    server.onClose((code, reason) => {
      state.live.delete(ws);
      void ws.close(closeOptions(code, reason));
    });
  });
  return state;
}

test.describe("Realtime reconnect (FR-26 c2, docs/07 §4)", () => {
  test("FR-26 c2: after a dropped connection the client reconnects and loads a notification created during the outage", async ({
    browser,
  }) => {
    const member = await createSignedInMember(browser, "MEMBER");
    const { page } = member;
    const realtime = await trackRealtime(page);

    await page.goto("/notifications");
    await expect(page.getByTestId("unread-count")).toHaveText("0");
    await expect.poll(() => realtime.live.size).toBe(1);

    // Drop the connection and refuse reconnects, so nothing can be pushed in real time.
    realtime.refuse = true;
    const attemptsBeforeDrop = realtime.attempts;
    await Promise.all([...realtime.live].map((ws) => ws.close()));
    await expect.poll(() => realtime.live.size).toBe(0);
    const projectName = await addMemberToNewProject(browser, member);

    // The notification committed while the client was offline: it was not pushed, and the client
    // kept trying to reconnect.
    await expect(page.getByTestId("unread-count")).toHaveText("0");
    await expect.poll(() => realtime.attempts, { timeout: 15_000 }).toBeGreaterThan(attemptsBeforeDrop);

    // Allow reconnecting: on open, the client revalidates and the missed notification appears.
    realtime.refuse = false;
    await expect(page.getByTestId("unread-count")).toHaveText("1", { timeout: 40_000 });
    await expect(page.getByTestId("notifications-list")).toContainText(projectName);
    await member.context.close();
  });

  test("FR-26 c1: notifications arrive over one long-lived connection (no reconnect per message)", async ({
    browser,
  }) => {
    const member = await createSignedInMember(browser, "MEMBER");
    const { page } = member;
    const realtime = await trackRealtime(page);

    await page.goto("/notifications");
    await expect(page.getByTestId("unread-count")).toHaveText("0");
    await expect.poll(() => realtime.live.size).toBe(1);
    const settledAttempts = realtime.attempts;

    const first = await addMemberToNewProject(browser, member);
    await expect(page.getByTestId("notifications-list")).toContainText(first, { timeout: 10_000 });
    const second = await addMemberToNewProject(browser, member);
    await expect(page.getByTestId("notifications-list")).toContainText(second, { timeout: 10_000 });

    // Both notifications were delivered and revalidated without the socket being torn down.
    expect(realtime.attempts).toBe(settledAttempts);
    expect(realtime.live.size).toBe(1);
    await member.context.close();
  });
});
