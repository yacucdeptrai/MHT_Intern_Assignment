import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cronState = sqliteTable("cron_state", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type CronStateRow = InferSelectModel<typeof cronState>;
export type NewCronStateRow = InferInsertModel<typeof cronState>;
