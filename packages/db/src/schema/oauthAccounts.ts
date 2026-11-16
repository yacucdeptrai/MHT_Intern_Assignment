import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { OAUTH_PROVIDERS } from "@pm/domain";

import { users } from "./users";

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider", { enum: OAUTH_PROVIDERS }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_oauth_provider_account").on(table.provider, table.providerAccountId),
    check("oauth_accounts_provider_check", sql`${table.provider} IN ('GOOGLE', 'MICROSOFT')`),
  ],
);

export type OAuthAccount = InferSelectModel<typeof oauthAccounts>;
export type NewOAuthAccount = InferInsertModel<typeof oauthAccounts>;
