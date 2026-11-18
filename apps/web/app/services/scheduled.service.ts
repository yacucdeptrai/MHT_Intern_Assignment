import { createLogger, type Logger } from "../utils/logger.server";
import { cleanupExpiredInvites, sweepOrphanFiles } from "./cleanup.service";
import { sweepOutbox } from "./outbox.service";
import { runDeadlineScan } from "./reminder.service";

export interface ScheduledStep {
  name: string;
  run: (env: Env, now: Date) => Promise<unknown>;
}

export interface ScheduledSteps {
  /** Run only on the hourly tick (minute 0), before the outbox sweep (docs/07 §2). */
  hourly: ScheduledStep[];
  /** Run on every 5-minute tick, last, so it also delivers jobs the hourly steps just queued. */
  everyTick: ScheduledStep[];
}

export const DEFAULT_SCHEDULED_STEPS: ScheduledSteps = {
  hourly: [
    { name: "runDeadlineScan", run: (env, now) => runDeadlineScan(env, now) },
    { name: "sweepOrphanFiles", run: (env, now) => sweepOrphanFiles(env, now) },
    { name: "cleanupExpiredInvites", run: (env, now) => cleanupExpiredInvites(env, now) },
  ],
  everyTick: [{ name: "sweepOutbox", run: (env, now) => sweepOutbox(env, now) }],
};

export interface ScheduledTickResult {
  ran: string[];
  failed: string[];
}

/**
 * Runs one cron tick. Each step is isolated: a step that throws is logged at `error` level and the
 * remaining steps still run, so one broken job (for example the deadline scan) can never block the
 * outbox sweep or the cleanup jobs.
 */
export async function runScheduledTick(
  env: Env,
  now: Date,
  steps: ScheduledSteps = DEFAULT_SCHEDULED_STEPS,
  logger: Logger = createLogger("scheduled"),
): Promise<ScheduledTickResult> {
  const due = now.getUTCMinutes() === 0 ? [...steps.hourly, ...steps.everyTick] : steps.everyTick;
  const result: ScheduledTickResult = { ran: [], failed: [] };

  for (const step of due) {
    try {
      await step.run(env, now);
      result.ran.push(step.name);
    } catch (error: unknown) {
      result.failed.push(step.name);
      logger.error("Scheduled step failed", {
        step: step.name,
        scheduledTime: now.toISOString(),
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return result;
}
