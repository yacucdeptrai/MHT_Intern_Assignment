import { AppError, ValidationError } from "@pm/domain";

import type { RequestContext } from "./requestContext.server";

export interface ActionErrorResponse {
  success: false;
  errors: Record<string, string[]>;
  message?: string;
}

export function handleActionError(error: unknown, ctx?: RequestContext): Response {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof ValidationError) {
    const body: ActionErrorResponse = {
      success: false,
      errors: error.fieldErrors ?? { form: [error.message] },
      message: error.message,
    };
    return Response.json(body, { status: 400 });
  }

  if (error instanceof AppError) {
    const body: ActionErrorResponse = {
      success: false,
      errors: { form: [error.message] },
      message: error.message,
    };
    return Response.json(body, { status: error.status });
  }

  if (ctx) {
    ctx.logger.error("Unhandled action error", { error: error instanceof Error ? error : undefined });
  }

  const body: ActionErrorResponse = {
    success: false,
    errors: { form: ["Something went wrong"] },
    message: "Something went wrong",
  };
  return Response.json(body, { status: 500 });
}
