import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema";

export type AppSchema = typeof schema;
export type AppDatabase = DrizzleD1Database<AppSchema>;

/** Creates the per-request database handle. Repositories receive it as their first parameter. */
export function createDatabase(d1: D1Database): AppDatabase {
  return drizzle(d1, { schema });
}
