import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../app/utils/logger.server";

describe("structured logger (Review Lesson #16)", () => {
  it("logs structured JSON with requestId, userId, and targetId context (Lesson #16)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-trace-123", { userId: "user-actor-456" });

    logger.info("User role updated", { targetId: "target-user-789" });

    expect(spy).toHaveBeenCalled();
    const raw: unknown = spy.mock.calls[0]?.[0];
    expect(typeof raw).toBe("string");
    const parsed: unknown = JSON.parse(raw as string);
    expect(parsed).toMatchObject({
      level: "info",
      msg: "User role updated",
      requestId: "req-trace-123",
      userId: "user-actor-456",
      targetId: "target-user-789",
    });

    spy.mockRestore();
  });
});
