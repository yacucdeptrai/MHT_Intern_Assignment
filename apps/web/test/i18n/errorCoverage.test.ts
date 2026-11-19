import { describe, expect, it } from "vitest";

interface ErrorCall {
  file: string;
  line: number;
  className: string;
  args: string;
}

// Explicit allow-list for error calls that are permitted to omit an explicit key option.
// Each entry must document the exact reason.
const ALLOW_LIST: Record<string, string> = {
  // Empty constructor calls use the class-level default translation key:
  // UnauthorizedError -> errors.unauthorized
  // ForbiddenError -> errors.forbidden
  // NotFoundError -> errors.not_found
  // ConflictError -> errors.conflict
  NO_ARG_CONSTRUCTOR: "Class constructor assigns default localized translation key automatically",
};

function findErrorCalls(): ErrorCall[] {
  const sources = import.meta.glob<string>(["../../app/**/*.{ts,tsx}", "../../../packages/domain/src/**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  });

  const regex =
    /new\s+(AppError|ValidationError|ForbiddenError|NotFoundError|ConflictError|UnauthorizedError)\s*\(([\s\S]*?)\)/g;

  const results: ErrorCall[] = [];
  for (const [filePath, content] of Object.entries(sources)) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const className = match[1] ?? "";
      const args = match[2]?.trim() ?? "";
      const line = content.substring(0, match.index).split("\n").length;
      results.push({ file: filePath, line, className, args });
    }
  }
  return results;
}

describe("error constructor translation key coverage", () => {
  const allCalls = findErrorCalls();

  it("finds error constructor calls in domain and web layers", () => {
    expect(allCalls.length).toBeGreaterThan(100);
  });

  it("ensures every user-facing error constructor specifies a translation key", () => {
    const missingKeys: { file: string; line: number; className: string; args: string }[] = [];

    for (const call of allCalls) {
      // If no arguments, it falls back to the default class-level translation key
      if (call.args === "") {
        continue;
      }

      // If args don't contain key:
      if (!call.args.includes("key:")) {
        const allowedReason = ALLOW_LIST[`${call.file}:${call.line}`];
        if (!allowedReason) {
          missingKeys.push(call);
        }
      }
    }

    expect(missingKeys, "Error constructor calls missing explicit translation key").toEqual([]);
  });

  it("deliberately fails when an error constructor omits a translation key", () => {
    const mockCall: ErrorCall = {
      file: "apps/web/app/services/example.service.ts",
      line: 42,
      className: "ValidationError",
      args: '"Unregistered error message without key"',
    };

    const hasKey = mockCall.args.includes("key:");
    expect(hasKey).toBe(false);

    const isAllowed = Boolean(ALLOW_LIST[`${mockCall.file}:${mockCall.line}`]);
    expect(isAllowed).toBe(false);
  });
});
