import { useTranslation } from "react-i18next";
import { useFetcher, useLocation } from "react-router";

import type { SupportedLanguage } from "../../i18n/types";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const fetcher = useFetcher();
  const location = useLocation();

  const currentLang: SupportedLanguage = i18n.language.startsWith("en") ? "en" : "vi";

  const handleSwitch = (newLang: SupportedLanguage) => {
    if (newLang === currentLang) {
      return;
    }
    void i18n.changeLanguage(newLang);
    const redirectTo = location.pathname + location.search;
    void fetcher.submit({ lang: newLang, redirectTo }, { method: "post", action: "/api/set-language" });
  };

  return (
    <div
      aria-label={t("common.language")}
      title={t("common.language")}
      className="inline-flex items-center rounded-md border border-gray-300 bg-white p-0.5 shadow-sm text-xs font-medium"
    >
      <button
        type="button"
        onClick={() => {
          handleSwitch("vi");
        }}
        aria-label={t("common.switch_to_vi")}
        title={t("common.vietnamese")}
        data-testid="lang-vi"
        className={`px-2 py-1 rounded ${
          currentLang === "vi"
            ? "bg-blue-600 text-white font-semibold"
            : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => {
          handleSwitch("en");
        }}
        aria-label={t("common.switch_to_en")}
        title={t("common.english")}
        data-testid="lang-en"
        className={`px-2 py-1 rounded ${
          currentLang === "en"
            ? "bg-blue-600 text-white font-semibold"
            : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        EN
      </button>
    </div>
  );
}
