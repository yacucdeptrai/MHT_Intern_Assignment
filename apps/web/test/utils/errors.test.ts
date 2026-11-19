import { describe, expect, it } from "vitest";

import { AppError, ValidationError } from "@pm/domain";
import { handleActionError } from "../../app/utils/errors.server";

describe("handleActionError", () => {
  it("formats ValidationError as 400 with field errors and maps registered messages to errorKeys", async () => {
    const error = new ValidationError("Invalid inputs", { email: ["Invalid email format"] });
    const response = handleActionError(error);
    expect(response.status).toBe(400);
    const body = await response.json<{
      success: boolean;
      errors: Record<string, string[]>;
      errorKey?: string;
      errorKeys?: Record<string, string[]>;
    }>();
    expect(body.success).toBe(false);
    expect(body.errors.email).toEqual(["Invalid email format"]);
    expect(body.errorKeys?.email).toEqual(["validation.invalid_email"]);
    expect(body.errorKey).toBe("errors.validation_failed");
  });

  it("formats AppError with correct status and errorKey", async () => {
    const error = new AppError("Forbidden action", 403);
    const response = handleActionError(error);
    expect(response.status).toBe(403);
    const body = await response.json<{
      success: boolean;
      message: string;
      errorKey?: string;
      errorKeys?: Record<string, string[]>;
    }>();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Forbidden action");
    expect(body.errorKey).toBe("errors.forbidden");
    expect(body.errorKeys?.form).toEqual(["errors.forbidden"]);
  });

  it("passes through thrown Response object without wrapping in 500", () => {
    const redirectRes = Response.redirect("http://localhost/login", 302);
    const response = handleActionError(redirectRes);
    expect(response).toBe(redirectRes);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost/login");
  });
});
