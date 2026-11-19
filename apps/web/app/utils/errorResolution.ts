import type { TFunction } from "i18next";

export interface ActionFeedbackPayload {
  success?: boolean;
  message?: string;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
  errorKeys?: Record<string, string[]>;
  errors?: Record<string, string[]>;
}

/**
 * Resolves a localized error message from action data by key only (Option A).
 * - When field is specified: reads errorKeys[field][0], calls t(key), or falls back to errors[field][0].
 * - When field is omitted: reads errorKey (with errorParams), calls t(errorKey, errorParams),
 *   or checks errorKeys.form[0], or falls back to message / errors.form[0].
 */
export function getActionError(
  t: TFunction,
  actionData?: ActionFeedbackPayload | null,
  field?: string,
): string | undefined {
  if (!actionData) {
    return undefined;
  }

  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;

  if (field) {
    const fieldKey = actionData.errorKeys?.[field]?.[0];
    if (fieldKey) {
      return translate(fieldKey);
    }
    return actionData.errors?.[field]?.[0];
  }

  if (actionData.errorKey) {
    return translate(actionData.errorKey, actionData.errorParams);
  }

  const formKey = actionData.errorKeys?.form?.[0];
  if (formKey) {
    return translate(formKey, actionData.errorParams);
  }

  return actionData.errors?.form?.[0] ?? actionData.message;
}
