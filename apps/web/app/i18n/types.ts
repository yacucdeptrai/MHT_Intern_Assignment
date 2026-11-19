import "i18next";
import type en from "./en.json";

export type SupportedLanguage = "vi" | "en";
export const DEFAULT_LANGUAGE: SupportedLanguage = "vi";
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["vi", "en"] as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
