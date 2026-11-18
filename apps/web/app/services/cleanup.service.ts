import { attachmentRepository, createDatabase, cronStateRepository, inviteRepository } from "@pm/db";
import {
  CRON_STATE_ORPHAN_CURSOR,
  INVITE_EXPIRY_THRESHOLD_MS,
  ORPHAN_AGE_THRESHOLD_MS,
  ORPHAN_SWEEP_BATCH_LIMIT,
} from "@pm/domain";

import { createLogger } from "../utils/logger.server";

export interface SweepResult {
  scanned: number;
  deleted: number;
  cursor: string | null;
}

export interface CleanupInvitesResult {
  deleted: number;
}

export async function sweepOrphanFiles(
  env: Env,
  now: Date = new Date(),
  options?: { batchLimit?: number },
): Promise<SweepResult> {
  const db = createDatabase(env.DB);
  const logger = createLogger("orphan-sweep");
  const limit = options?.batchLimit ?? ORPHAN_SWEEP_BATCH_LIMIT;

  // Read stored cursor from cron_state
  const savedCursor = await cronStateRepository.get(db, CRON_STATE_ORPHAN_CURSOR);

  // List R2 objects under projects/ prefix (never avatars/)
  const listing = await env.FILES.list({
    prefix: "projects/",
    cursor: savedCursor ?? undefined,
    limit,
  });

  const nowMs = now.getTime();
  let deletedCount = 0;

  // Filter objects: strictly projects/ prefix, and older than 24 hours
  const candidateObjects = listing.objects.filter((obj) => {
    if (!obj.key.startsWith("projects/")) return false;
    const ageMs = nowMs - obj.uploaded.getTime();
    return ageMs > ORPHAN_AGE_THRESHOLD_MS;
  });

  if (candidateObjects.length > 0) {
    const candidateKeys = candidateObjects.map((obj) => obj.key);
    const existingKeys = await attachmentRepository.findExistingStorageKeys(db, candidateKeys);

    for (const obj of candidateObjects) {
      if (!existingKeys.has(obj.key)) {
        try {
          await env.FILES.delete(obj.key);
          deletedCount++;
          logger.info("Deleted orphan R2 object", { key: obj.key });
        } catch (err) {
          logger.warn("Failed to delete orphan R2 object", {
            key: obj.key,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }
  }

  // Resumable cursor management:
  // If listing is truncated, save listing.cursor; if complete, clear cursor (null).
  const nextCursor = listing.truncated ? listing.cursor : null;
  await cronStateRepository.upsert(db, CRON_STATE_ORPHAN_CURSOR, nextCursor, now);

  logger.info("Completed orphan file sweep pass", {
    scanned: listing.objects.length,
    deleted: deletedCount,
    truncated: listing.truncated,
    nextCursor,
  });

  return {
    scanned: listing.objects.length,
    deleted: deletedCount,
    cursor: nextCursor,
  };
}

export async function cleanupExpiredInvites(env: Env, now: Date = new Date()): Promise<CleanupInvitesResult> {
  const db = createDatabase(env.DB);
  const logger = createLogger("invite-cleanup");

  const cutoff = new Date(now.getTime() - INVITE_EXPIRY_THRESHOLD_MS);
  const results = await db.batch([inviteRepository.deleteExpiredBeforeStmt(db, cutoff)]);

  const d1Result = results[0] as { meta?: { changes?: number } } | undefined;
  const deleted = d1Result?.meta?.changes ?? 0;

  logger.info("Cleaned up expired invites", { cutoff: cutoff.toISOString(), deleted });

  return { deleted };
}
