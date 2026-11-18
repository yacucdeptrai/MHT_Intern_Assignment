import { createDatabase, reminderLogRepository } from "@pm/db";
import {
  getTodayDateString,
  isDueSoon,
  isOverdue,
  type EmailDeadlineReminderPayload,
  type ReminderKind,
} from "@pm/domain";

import { createLogger } from "../utils/logger.server";

export interface ScanResult {
  scannedCount: number;
  enqueuedCount: number;
}

export async function runDeadlineScan(env: Env, now: Date = new Date()): Promise<ScanResult> {
  const db = createDatabase(env.DB);
  const logger = createLogger("deadline-scan");
  const todayStr = getTodayDateString(now);

  const candidates = await reminderLogRepository.findCandidateTasks(db, todayStr, 100);
  let enqueuedCount = 0;

  for (const candidate of candidates) {
    const target = {
      dueDate: candidate.dueDate,
      statusCategory: candidate.statusCategory,
      deletedAt: null,
    };

    const kind: ReminderKind = isOverdue(target, now)
      ? "OVERDUE"
      : isDueSoon(target, now)
        ? "DUE_SOON"
        : candidate.kind;

    const payload: EmailDeadlineReminderPayload = {
      taskId: candidate.taskId,
      userId: candidate.userId,
      kind,
      dueDate: candidate.dueDate,
    };

    const jobId = crypto.randomUUID();
    const batchResult = await db.batch([
      reminderLogRepository.insertLogStmt(db, {
        taskId: candidate.taskId,
        userId: candidate.userId,
        kind,
        dueDate: candidate.dueDate,
        sentAt: now,
      }),
      reminderLogRepository.insertJobIfNewStmt(db, {
        id: jobId,
        payload: JSON.stringify(payload),
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const jobStmtResult = batchResult[1] as { meta?: { changes?: number } } | undefined;
    if (jobStmtResult?.meta?.changes === 1) {
      enqueuedCount++;
      logger.info("Enqueued deadline reminder job", {
        jobId,
        taskId: candidate.taskId,
        userId: candidate.userId,
        kind,
        dueDate: candidate.dueDate,
      });
    }
  }

  logger.info("Deadline scan complete", {
    todayStr,
    scannedCount: candidates.length,
    enqueuedCount,
  });

  return {
    scannedCount: candidates.length,
    enqueuedCount,
  };
}
