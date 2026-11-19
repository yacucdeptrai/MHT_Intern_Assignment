import type { SupportedLanguage } from "../i18n/types";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../i18n/types";

export const LANG_COOKIE_NAME = "lang";
export const LANG_COOKIE_MAX_AGE_S = 31536000; // ~1 year

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function getLanguage(request: Request): SupportedLanguage {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return DEFAULT_LANGUAGE;
  }
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE_NAME}=([^;]+)`));
  const rawValue = match && match[1] !== undefined ? decodeURIComponent(match[1]) : null;
  if (isSupportedLanguage(rawValue)) {
    return rawValue;
  }
  return DEFAULT_LANGUAGE;
}

export function createLanguageCookie(lang: SupportedLanguage, isSecure = false): string {
  const secureFlag = isSecure ? "; Secure" : "";
  return `${LANG_COOKIE_NAME}=${lang}; Path=/; SameSite=Lax; Max-Age=${LANG_COOKIE_MAX_AGE_S}${secureFlag}`;
}
