import type { ReactNode } from "react";
import { TailorLanguageSchema, type TailorLanguage } from "@resumora/shared";
import { t } from "../i18n/t.ts";

type Props = {
  /** The job being tailored for, and the way out. */
  jobName?: string;
  onExit(): void;
  /** The match with the base CV, and with the tailored CV as it stands. */
  base: number | null;
  now: number | null;
  /** The ad's keywords the CV shows, out of all of them; absent when there is nothing to compare. */
  keywords?: { has: number; total: number };
  /** The language the CV is written in; `onPick` (a menu) only while another language can still start again. */
  language?: { value: TailorLanguage; onPick?(language: TailorLanguage): void };
  /** Opens the tone and the extra questions; absent while a screen that can't be left is up. */
  onAdjust?(): void;
  children: ReactNode;
};

/**
 * The room tailoring happens in, from the questions to the result: one bar (the job, the match, the CV's language,
 * Adjust and the way out) over the screen of the moment.
 */
export function Room({ jobName, onExit, base, now, keywords, language, onAdjust, children }: Props) {
  const name = (code: TailorLanguage) => t(`tailored.lang.${code}`);
  return <div className="ui-page tailor-room">
    <header className="tailor-room-bar">
      <span className="fm-brand">{t("app.name")}</span>
      <p className="fm-ctx">{jobName && <><span>{t("tailor.for")}</span>: <b>{jobName}</b></>}</p>
      {base !== null && <p className="tailor-room-score" aria-label={t("tailor.room.match")}>
        <span>{t("tailor.room.match")}</span> <b>{base}</b>
        {now !== null && now !== base && <> <span aria-hidden="true">→</span> <b className={now > base ? "is-up" : undefined}>{now}</b></>}
      </p>}
      {keywords && <p className="tailor-room-score" aria-label={t("tailor.kw.bar")}>
        <span aria-hidden="true">{t("tailor.room.keywords")}</span> <b>{keywords.has}/{keywords.total}</b>
      </p>}
      {language && (language.onPick
        ? <label className="tailor-room-lang"><span className="ui-sr">{t("tailor.room.language")}</span>
          <select value={language.value} onChange={(event) => language.onPick!(event.target.value as TailorLanguage)}>
            {TailorLanguageSchema.options.map((code) => <option key={code} value={code}>{name(code)}</option>)}
          </select></label>
        : <p className="tailor-room-lang ui-small">{t("tailor.room.languageIs", { language: name(language.value) })}</p>)}
      <div className="fm-bar-actions">
        {onAdjust && <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onAdjust}>{t("tailor.steps.steering")}</button>}
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={onExit}>{t("tailor.back")}</button>
      </div>
    </header>
    <main className="tailor-room-main">{children}</main>
  </div>;
}
