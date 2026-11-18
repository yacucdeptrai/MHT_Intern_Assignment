import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { runScheduledTick, type ScheduledStep } from "../../app/services/scheduled.service";

function recordingStep(name: string, calls: string[], fail = false): ScheduledStep {
  return {
    name,
    run: () => {
      calls.push(name);
      return fail ? Promise.reject(new Error(`${name} exploded`)) : Promise.resolve();
    },
  };
}

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("runScheduledTick (docs/07 §2)", () => {
  const hourlyTime = new Date("2026-11-19T03:00:00.000Z");
  const fiveMinuteTime = new Date("2026-11-19T03:05:00.000Z");

  it("isolates steps: a failing hourly step is logged and the remaining steps, including sweepOutbox, still run", async () => {
    const calls: string[] = [];
    const logger = createMockLogger();

    const result = await runScheduledTick(
      env,
      hourlyTime,
      {
        hourly: [
          recordingStep("runDeadlineScan", calls, true),
          recordingStep("sweepOrphanFiles", calls),
          recordingStep("cleanupExpiredInvites", calls),
        ],
        everyTick: [recordingStep("sweepOutbox", calls)],
      },
      logger,
    );

    expect(calls).toEqual(["runDeadlineScan", "sweepOrphanFiles", "cleanupExpiredInvites", "sweepOutbox"]);
    expect(result.failed).toEqual(["runDeadlineScan"]);
    expect(result.ran).toEqual(["sweepOrphanFiles", "cleanupExpiredInvites", "sweepOutbox"]);
    expect(logger.error).toHaveBeenCalledWith(
      "Scheduled step failed",
      expect.objectContaining({ step: "runDeadlineScan" }),
    );
  });

  it("runs only the every-tick steps when the minute is not 0", async () => {
    const calls: string[] = [];
    await runScheduledTick(
      env,
      fiveMinuteTime,
      { hourly: [recordingStep("runDeadlineScan", calls)], everyTick: [recordingStep("sweepOutbox", calls)] },
      createMockLogger(),
    );
    expect(calls).toEqual(["sweepOutbox"]);
  });
});
