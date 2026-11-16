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

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type: string }).type === "DataWithResponseInit"
  ) {
    const dataInit = error as unknown as { data: unknown; init?: ResponseInit };
    const textMsg = typeof dataInit.data === "string" ? dataInit.data : "Forbidden";
    const body: ActionErrorResponse = {
      success: false,
      errors: { form: [textMsg] },
      message: textMsg,
    };
    return Response.json(body, { status: dataInit.init?.status ?? 403 });
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
