import { and, eq } from "drizzle-orm";

import type { OAuthProvider } from "@pm/domain";

import type { AppDatabase } from "../client";
import { oauthAccounts, type NewOAuthAccount, type OAuthAccount } from "../schema/oauthAccounts";

export const oauthAccountRepository = {
  insertStmt(db: AppDatabase, account: NewOAuthAccount) {
    return db.insert(oauthAccounts).values(account);
  },

  async insert(db: AppDatabase, account: NewOAuthAccount): Promise<OAuthAccount> {
    const [created] = await db.insert(oauthAccounts).values(account).returning();
    if (!created) {
      throw new Error("Failed to insert oauth account");
    }
    return created;
  },

  async findByProviderAccount(
    db: AppDatabase,
    provider: OAuthProvider,
    providerAccountId: string,
  ): Promise<OAuthAccount | null> {
    const [found] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
      .limit(1);
    return found ?? null;
  },

  async findByUserId(db: AppDatabase, userId: string): Promise<OAuthAccount[]> {
    return db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  },
};
