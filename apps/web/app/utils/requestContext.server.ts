import { createContext } from "react-router";

import type { AppDatabase } from "@pm/db";
import { createDatabase } from "@pm/db";
import type { SessionUser } from "@pm/domain";

import { createLogger, type Logger } from "./logger.server";

export interface RequestContext {
  env: Env;
  db: AppDatabase;
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

  return {
    env,
    db,
    user: null,
    requestId,
    logger,
    waitUntil: (promise) => {
      executionCtx.waitUntil(promise);
    },
    clock: { now: () => new Date() },
  };
}
