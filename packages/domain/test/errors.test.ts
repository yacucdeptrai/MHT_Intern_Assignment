import { describe, expect, it } from "vitest";

import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../src";

describe("domain errors", () => {
  it("creates AppError with custom status and message", () => {
    const error = new AppError("Something custom", 418);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AppError");
    expect(error.message).toBe("Something custom");
    expect(error.status).toBe(418);
  });

  it("creates ValidationError with status 400 and optional field errors", () => {
    const fieldErrors = { email: ["Invalid email format"] };
    const error = new ValidationError("Validation failed", fieldErrors);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ValidationError");
    expect(error.status).toBe(400);
    expect(error.message).toBe("Validation failed");
    expect(error.fieldErrors).toEqual(fieldErrors);
  });

  it("creates UnauthorizedError with status 401", () => {
    const error = new UnauthorizedError();
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("UnauthorizedError");
    expect(error.status).toBe(401);
    expect(error.message).toBe("Unauthorized");
  });

  it("creates ForbiddenError with status 403", () => {
    const error = new ForbiddenError();
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ForbiddenError");
    expect(error.status).toBe(403);
    expect(error.message).toBe("Forbidden");
  });

  it("creates NotFoundError with status 404", () => {
    const error = new NotFoundError("Project not found");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("NotFoundError");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Project not found");
  });

  it("creates ConflictError with status 409", () => {
    const error = new ConflictError("Task version mismatch");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ConflictError");
    expect(error.status).toBe(409);
    expect(error.message).toBe("Task version mismatch");
  });
});
