import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { getActionError } from "../../app/utils/errorResolution";

/* cspell:disable */
describe("getActionError", () => {
  const translations: Record<string, string> = {
    "validation.invalid_email": "Định dạng email không hợp lệ",
    "errors.status_in_use": "Trạng thái này đang được dùng bởi {{count}} công việc",
    "errors.project_not_found": "Không tìm thấy dự án",
  };

  const mockT = ((key: string, options?: Record<string, unknown>) => {
    let text = translations[key] ?? key;
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        text = text.replace(`{{${k}}}`, String(v));
      }
    }
    return text;
  }) as unknown as TFunction;

  it("returns undefined for null or undefined actionData", () => {
    expect(getActionError(mockT, null)).toBeUndefined();
    expect(getActionError(mockT, undefined)).toBeUndefined();
  });

  it("translates field error using errorKeys when available", () => {
    const actionData = {
      errors: { email: ["Invalid email format"] },
      errorKeys: { email: ["validation.invalid_email"] },
    };
    expect(getActionError(mockT, actionData, "email")).toBe("Định dạng email không hợp lệ");
  });

  it("falls back to raw field error when errorKeys is missing", () => {
    const actionData = {
      errors: { email: ["Invalid email format"] },
    };
    expect(getActionError(mockT, actionData, "email")).toBe("Invalid email format");
  });

  it("translates top-level errorKey with params", () => {
    const actionData = {
      message: "This status is in use by 3 tasks",
      errorKey: "errors.status_in_use",
      errorParams: { count: 3 },
    };
    expect(getActionError(mockT, actionData)).toBe("Trạng thái này đang được dùng bởi 3 công việc");
  });

  it("translates form-level error via errorKeys.form", () => {
    const actionData = {
      message: "Project not found",
      errorKeys: { form: ["errors.project_not_found"] },
    };
    expect(getActionError(mockT, actionData)).toBe("Không tìm thấy dự án");
  });

  it("falls back to message when neither errorKey nor errorKeys.form exists", () => {
    const actionData = {
      message: "Some untranslated server error",
    };
    expect(getActionError(mockT, actionData)).toBe("Some untranslated server error");
  });
});
/* cspell:enable */
