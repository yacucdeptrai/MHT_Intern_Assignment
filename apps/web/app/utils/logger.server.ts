export interface LogContext {
  userId?: string;
  projectId?: string;
  taskId?: string;
  targetId?: string;
  durationMs?: number;
  error?: Error | { name: string; message: string; stack?: string };
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
}

export function createLogger(requestId: string, defaultContext?: LogContext): Logger {
  function log(level: "debug" | "info" | "warn" | "error", msg: string, context?: LogContext) {
    const payload = {
      level,
      msg,
      requestId,
      ...defaultContext,
      ...context,
    };
    if (payload.error instanceof Error) {
      payload.error = {
        name: payload.error.name,
        message: payload.error.message,
        stack: payload.error.stack,
      };
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }

  return {
    debug: (msg, ctx) => {
      log("debug", msg, ctx);
    },
    info: (msg, ctx) => {
      log("info", msg, ctx);
    },
    warn: (msg, ctx) => {
      log("warn", msg, ctx);
    },
    error: (msg, ctx) => {
      log("error", msg, ctx);
    },
  };
}
