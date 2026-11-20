import { useTranslation } from "react-i18next";
import { useFetcher, useLocation } from "react-router";

import type { SupportedLanguage } from "../../i18n/types";
import { ViewSwitcher } from "../ui/ViewSwitcher";

/** Hook shared by the sidebar switcher and the ⌘K language command. */
export function useLanguageSwitch() {
  const { i18n } = useTranslation();
  const fetcher = useFetcher();
  const location = useLocation();
  const currentLang: SupportedLanguage = i18n.language.startsWith("en") ? "en" : "vi";

  const switchTo = (newLang: SupportedLanguage) => {
    if (newLang === currentLang) {
      return;
    }
    void i18n.changeLanguage(newLang);
    const redirectTo = location.pathname + location.search;
    void fetcher.submit({ lang: newLang, redirectTo }, { method: "post", action: "/api/set-language" });
  };

  return { currentLang, switchTo };
}

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { currentLang, switchTo } = useLanguageSwitch();

  return (
    <ViewSwitcher<SupportedLanguage>
      label={t("common.language")}
      value={currentLang}
      onChange={switchTo}
      views={[
        { id: "en", label: "EN", title: t("common.english"), "data-testid": "lang-en" },
        { id: "vi", label: "VI", title: t("common.vietnamese"), "data-testid": "lang-vi" },
      ]}
    />
  );
}
