import { createContext } from "react-router";

import type { AppDatabase } from "@pm/db";
import { createDatabase } from "@pm/db";
import type { FileStorage, SessionUser } from "@pm/domain";

import { R2FileStorage } from "../services/storage/r2FileStorage.server";
import { createLogger, type Logger } from "./logger.server";

export interface RequestContext {
  env: Env;
  db: AppDatabase;
  storage?: FileStorage;
  user: SessionUser | null;
  requestId: string;
  logger: Logger;
  waitUntil: (promise: Promise<unknown>) => void;
  clock: { now(): Date };
}

export const requestContextKey = createContext<RequestContext>();

export function createRequestContext(
  env: Env,
  executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
  request: Request,
): RequestContext {
  const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
  const logger = createLogger(requestId);
  const db = createDatabase(env.DB);
  const storage = new R2FileStorage(env.FILES);

  return {
    env,
    db,
    storage,
    user: null,
    requestId,
    logger,
    waitUntil: (promise) => {
      executionCtx.waitUntil(promise);
    },
    clock: { now: () => new Date() },
  };
}
