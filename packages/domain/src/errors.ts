export interface ErrorOptions {
  key?: string | undefined;
  params?: Record<string, string | number> | undefined;
  cause?: unknown;
}

export interface ValidationErrorOptions extends ErrorOptions {
  fieldErrors?: Record<string, string[]> | undefined;
}

export class AppError extends Error {
  readonly status: number;
  readonly key?: string | undefined;
  readonly params?: Record<string, string | number> | undefined;

  constructor(message: string, statusOrOptions: number | ErrorOptions = 500, maybeOptions?: ErrorOptions) {
    super(message);
    this.name = "AppError";
    if (typeof statusOrOptions === "number") {
      this.status = statusOrOptions;
      this.key = maybeOptions?.key;
      this.params = maybeOptions?.params;
    } else {
      this.status = 500;
      this.key = statusOrOptions.key;
      this.params = statusOrOptions.params;
    }
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors?: Record<string, string[]> | undefined;

  constructor(
    message: string,
    optionsOrFieldErrors?: Record<string, string[]> | ValidationErrorOptions,
    maybeOptions?: ErrorOptions,
  ) {
    let key: string | undefined;
    let params: Record<string, string | number> | undefined;
    let fieldErrors: Record<string, string[]> | undefined;

    if (optionsOrFieldErrors) {
      if ("key" in optionsOrFieldErrors || "params" in optionsOrFieldErrors || "fieldErrors" in optionsOrFieldErrors) {
        const opts = optionsOrFieldErrors as ValidationErrorOptions;
        key = opts.key;
        params = opts.params;
        fieldErrors = opts.fieldErrors;
      } else {
        fieldErrors = optionsOrFieldErrors as Record<string, string[]>;
      }
    }

    if (maybeOptions) {
      key = maybeOptions.key ?? key;
      params = maybeOptions.params ?? params;
    }

    super(message, 400, { key, params });
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", options?: ErrorOptions) {
    super(message, 401, options ?? { key: "errors.unauthorized" });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", options?: ErrorOptions) {
    super(message, 403, options ?? { key: "errors.forbidden" });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", options?: ErrorOptions) {
    super(message, 404, options ?? { key: "errors.not_found" });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", options?: ErrorOptions) {
    super(message, 409, options ?? { key: "errors.conflict" });
    this.name = "ConflictError";
  }
}
