import { AppError, getValidationMessageKey, ValidationError } from "@pm/domain";

import type { RequestContext } from "./requestContext.server";

export interface ActionErrorResponse {
  success: false;
  errors: Record<string, string[]>;
  message?: string;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  errorKeys?: Record<string, string[]>;
}

function mapFieldErrorsToKeys(fieldErrors: Record<string, string[]>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    result[field] = messages.map((msg) => getValidationMessageKey(msg) ?? msg);
  }
  return result;
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
      errorKey: "errors.forbidden",
      errorKeys: { form: ["errors.forbidden"] },
    };
    return Response.json(body, { status: dataInit.init?.status ?? 403 });
  }

  if (error instanceof ValidationError) {
    const rawErrors = error.fieldErrors ?? { form: [error.message] };
    const errorKeys = mapFieldErrorsToKeys(rawErrors);
    const topKey: string = error.key ?? getValidationMessageKey(error.message) ?? "errors.validation_failed";
    const body: ActionErrorResponse = {
      success: false,
      errors: rawErrors,
      message: error.message,
      errorKey: topKey,
      errorParams: error.params,
      errorKeys,
    };
    return Response.json(body, { status: 400 });
  }

  if (error instanceof AppError) {
    const defaultKey =
      error.status === 401
        ? "errors.unauthorized"
        : error.status === 403
          ? "errors.forbidden"
          : error.status === 404
            ? "errors.not_found"
            : error.status === 409
              ? "errors.conflict"
              : "errors.internal";
    const errorKey: string = error.key ?? defaultKey;
    const body: ActionErrorResponse = {
      success: false,
      errors: { form: [error.message] },
      message: error.message,
      errorKey,
      errorParams: error.params,
      errorKeys: { form: [errorKey] },
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
    errorKey: "errors.internal",
    errorKeys: { form: ["errors.internal"] },
  };
  return Response.json(body, { status: 500 });
}
