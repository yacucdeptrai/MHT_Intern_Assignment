import { describe, expect, it, vi } from "vitest";

import { ConsoleEmailSender, createEmailSender } from "../../app/services/email/emailSender";

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("createEmailSender (EMAIL_PROVIDER, docs/07 §3)", () => {
  it("returns the console sender for EMAIL_PROVIDER=console without warning", () => {
    const logger = createMockLogger();
    expect(createEmailSender({ EMAIL_PROVIDER: "console" }, logger)).toBe(ConsoleEmailSender);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("falls back to the console sender and warns for an unknown provider", () => {
    const logger = createMockLogger();
    expect(createEmailSender({ EMAIL_PROVIDER: "smtp-not-built" }, logger)).toBe(ConsoleEmailSender);
    expect(logger.warn).toHaveBeenCalledWith(
      "Unknown EMAIL_PROVIDER; falling back to the console sender",
      expect.objectContaining({ provider: "smtp-not-built" }),
    );
  });
});
