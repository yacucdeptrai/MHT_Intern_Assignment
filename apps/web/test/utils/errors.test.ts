import { describe, expect, it } from "vitest";

import { AppError, ValidationError } from "@pm/domain";
import { handleActionError } from "../../app/utils/errors.server";

describe("handleActionError", () => {
  it("formats ValidationError as 400 with field errors", async () => {
    const error = new ValidationError("Invalid inputs", { email: ["Invalid format"] });
    const response = handleActionError(error);
    expect(response.status).toBe(400);
    const body = await response.json<{ success: boolean; errors: Record<string, string[]> }>();
    expect(body.success).toBe(false);
    expect(body.errors.email).toEqual(["Invalid format"]);
  });

  it("formats AppError with correct status", async () => {
    const error = new AppError("Forbidden action", 403);
    const response = handleActionError(error);
    expect(response.status).toBe(403);
    const body = await response.json<{ success: boolean; message: string }>();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Forbidden action");
  });

  it("passes through thrown Response object without wrapping in 500", () => {
    const redirectRes = Response.redirect("http://localhost/login", 302);
    const response = handleActionError(redirectRes);
    expect(response).toBe(redirectRes);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost/login");
  });
});
