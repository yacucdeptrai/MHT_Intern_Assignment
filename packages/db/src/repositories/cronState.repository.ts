import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../client";
import { cronState } from "../schema/cronState";

export const cronStateRepository = {
  get: async (db: AppDatabase, key: string): Promise<string | null> => {
    const rows = await db.select({ value: cronState.value }).from(cronState).where(eq(cronState.key, key)).limit(1);
    return rows[0]?.value ?? null;
  },

  upsertStmt: (db: AppDatabase, key: string, value: string | null, now: Date): BatchItem<"sqlite"> => {
    return db
      .insert(cronState)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: cronState.key,
        set: { value, updatedAt: now },
      });
  },

  upsert: async (db: AppDatabase, key: string, value: string | null, now: Date): Promise<void> => {
    await db.batch([cronStateRepository.upsertStmt(db, key, value, now)]);
  },
};
