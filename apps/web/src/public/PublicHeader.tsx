import { Link } from "react-router";
import { LANGUAGES, setLanguage, useLanguage } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";
import { ButtonLink } from "../ui/index.ts";

/** Top bar of the pages a signed-out visitor sees. */
export function PublicHeader() {
  const t = useT();
  const current = useLanguage();
  return (
    <div className="shell-band">
      <header className="ui-wrap shell-top">
        <Link className="shell-brand" to="/">
          {t("app.name")}
        </Link>
        <nav aria-label={t("public.nav.label")} className="shell-nav">
          <Link to="/#how">{t("public.nav.how")}</Link>
          <Link to="/#extension">{t("public.nav.extension")}</Link>
          <span className="shell-lang" role="group" aria-label={t("public.language.label")}>
            {LANGUAGES.map((language) => (
              <button key={language} type="button" aria-pressed={language === current} aria-label={t(`public.language.${language}`)} onClick={() => setLanguage(language)}>
                {language.toUpperCase()}
              </button>
            ))}
          </span>
          <Link to="/login">{t("public.nav.login")}</Link>
          <ButtonLink to="/signup" size="sm">
            {t("public.nav.signup")}
          </ButtonLink>
        </nav>
      </header>
    </div>
  );
}
