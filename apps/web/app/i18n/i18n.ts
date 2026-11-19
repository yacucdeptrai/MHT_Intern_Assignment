import i18n, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import type { SupportedLanguage } from "./types";
import { DEFAULT_LANGUAGE } from "./types";
import vi from "./vi.json";

export const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

const baseInstance: I18nInstance = i18n.createInstance();
void baseInstance.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export function getScopedI18n(lng: SupportedLanguage): I18nInstance {
  return baseInstance.cloneInstance({ lng });
}

export default baseInstance;
