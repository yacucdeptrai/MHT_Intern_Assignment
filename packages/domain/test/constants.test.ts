import { describe, expect, it } from "vitest";

import { DUE_SOON_WINDOW_MS, OUTBOX_MAX_ATTEMPTS, STATUS_CATEGORIES, TOKEN_INVITE_EXPIRY_MS } from "../src";

describe("domain constants", () => {
  it("expires invites after exactly 7 days", () => {
    expect(TOKEN_INVITE_EXPIRY_MS).toBe(604_800_000);
  });

  it("treats tasks as due soon within 24 hours", () => {
    expect(DUE_SOON_WINDOW_MS).toBe(86_400_000);
  });

  it("retries outbox jobs at most 5 times", () => {
    expect(OUTBOX_MAX_ATTEMPTS).toBe(5);
  });

  it("defines the four fixed status categories in workflow order", () => {
    expect(STATUS_CATEGORIES).toEqual(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]);
  });
});
