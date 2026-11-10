import { LANGUAGES, setLanguage, useLanguage } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";

/** Switches the interface language. CV text keeps its own language. */
export function LanguageSwitch() {
  const t = useT();
  const current = useLanguage();
  return (
    <div className="ui-tablist" role="group" aria-label={t("ui.language.label")}>
      {LANGUAGES.map((language) => (
        <button key={language} type="button" className="ui-tab" lang={language} aria-pressed={language === current} onClick={() => setLanguage(language)}>
          {t(`ui.language.${language}`)}
        </button>
      ))}
    </div>
  );
}
