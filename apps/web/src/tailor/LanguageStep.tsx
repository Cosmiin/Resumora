import { useEffect, useState } from "react";
import { TailorLanguageSchema, type TailorLanguage } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { Radio, Skeleton } from "../ui/index.ts";
import { getLanguages, type Languages } from "./tailor-api.ts";

type Props = {
  jobId: string;
  /** The language picked earlier (after Back from the keywords). */
  picked?: TailorLanguage;
  onContinue(language: TailorLanguage): void;
};

/** Step 1: the CV's language next to the ad's, and the language this tailored CV will be written in. */
export function LanguageStep({ jobId, picked, onContinue }: Props) {
  const t = useT();
  const [found, setFound] = useState<Languages | null>(null);
  const [failed, setFailed] = useState(false);
  const [language, setLanguage] = useState<TailorLanguage | undefined>(picked);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getLanguages(jobId).then((reply) => {
      if (!live) return;
      setFound(reply);
      setLanguage((current) => current ?? reply.chosen);
    }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [jobId]);

  if (failed) {
    // Without the check the person still picks a language; nothing is lost.
    return <section className="ui-stack tailor-narrow">
      <h1 className="ui-title">{t("tailor.lang.question")}</h1>
      <p className="ui-notice">{t("tailor.lang.unknown")}</p>
      <Choices value={language ?? "en"} onChange={setLanguage} />
      <div className="tailor-foot"><span /><button type="button" className="ui-btn ui-btn--primary" onClick={() => onContinue(language ?? "en")}>{t("tailor.lang.continue")}</button></div>
    </section>;
  }
  if (!found || !language) {
    return <section className="ui-stack tailor-narrow" aria-busy="true">
      <p role="status" className="ui-sr">{t("tailor.loading")}</p>
      <Skeleton width="70%" height="40px" /><Skeleton height="96px" /><Skeleton width="60%" height="180px" />
    </section>;
  }

  const name = (code: TailorLanguage) => t(`tailored.lang.${code}`);
  const same = found.ad === found.cv;
  return <section className="tailor-narrow">
    <h1 className="ui-title">{found.ad === null ? t("tailor.lang.titleCvOnly", { cv: name(found.cv) })
      : same ? t("tailor.lang.titleSame", { language: name(found.cv) })
        : t("tailor.lang.titleDifferent", { cv: name(found.cv), ad: name(found.ad) })}</h1>
    <div className="tailor-pair">
      <div className="ui-sheet"><p className="ui-label">{t("tailor.lang.cv")}</p><p className="tailor-big">{name(found.cv)}</p></div>
      <span className="tailor-pair-plus" aria-hidden="true">+</span>
      <div className="ui-sheet"><p className="ui-label">{t("tailor.lang.ad")}</p>
        <p className="tailor-big">{found.ad === null ? t("tailor.lang.adUnclear") : same ? name(found.ad) : <mark className="ui-mark">{name(found.ad)}</mark>}</p></div>
    </div>
    {found.ad !== null && !same && <p className="ui-notice tailor-gap">{t("tailor.lang.different")}</p>}
    <fieldset className="tailor-lang-pick">
      <legend className="ui-coach">{t("tailor.lang.question")}</legend>
      <Choices value={language} onChange={setLanguage} />
    </fieldset>
    <p className="ui-small ui-muted tailor-gap">{t("tailor.lang.hint")}</p>
    <div className="tailor-foot">
      <span className="ui-small ui-muted">{t("tailor.lang.later")}</span>
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => onContinue(language)}>{t("tailor.lang.continue")}</button>
    </div>
  </section>;
}

function Choices({ value, onChange }: { value: TailorLanguage; onChange(language: TailorLanguage): void }) {
  const t = useT();
  return <div className="ui-stack ui-stack--s">
    {TailorLanguageSchema.options.map((code) =>
      <Radio key={code} name="tailor-language" label={t(`tailored.lang.${code}`)} checked={value === code} onChange={() => onChange(code)} />)}
  </div>;
}
