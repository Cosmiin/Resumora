import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { TailorLanguageSchema, type MatchScore, type TailorLanguage } from "@resumora/shared";
import { listTailored, translate } from "./tailored-api.ts";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getTemplate, TEMPLATES, type TemplateId } from "../cv/page/templates.ts";

export type TailoredTab = "cv" | "letter";

type Props = {
  tab: TailoredTab;
  onTab(tab: TailoredTab): void;
  /** Score 1 (Base CV) and this tailored CV's Score 2. */
  base: MatchScore | null;
  latest: MatchScore | null;
  template: TemplateId;
  onTemplate(template: TemplateId): void;
  /** Actions after Template (Language, Re-tailor); Export stays a placeholder until its task. */
  children?: ReactNode;
};

/**
 * Language ▾: the job's copies in other languages (Open) and the missing ones (Translate). "Translate again"
 * replaces a copy's edits, so it asks first. An original tailored in another language can be opened, never replaced.
 */
export function LanguageMenu({ jobId, current }: { jobId: string; current: { id: string; language: TailorLanguage } }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<TailorLanguage | null>(null);
  const [busy, setBusy] = useState<TailorLanguage | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const copies = useQuery({ queryKey: ["tailored-list", jobId], queryFn: () => listTailored(jobId), enabled: open });
  const show = (id: string) => void navigate(`/jobs/${encodeURIComponent(jobId)}/cv?cv=${encodeURIComponent(id)}`);
  async function run(language: TailorLanguage) {
    setBusy(language);
    setFailed(false);
    setConfirming(null);
    try {
      const { tailoredCvId } = await translate(current.id, language);
      setOpen(false);
      show(tailoredCvId);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tailored-menu">
      <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t("tailored.language")}</button>
      {open && (
        <div className="tailored-menu-pop">
          {failed && <p role="alert" className="form-error">{t("tailored.lang.error")}</p>}
          {copies.isPending ? <p role="status">{t("tailor.loading")}</p> : (
            <ul aria-label={t("tailored.languages")}>
              {TailorLanguageSchema.options.filter((language) => language !== current.language).map((language) => {
                const copy = copies.data?.find((item) => item.language === language);
                const name = t(`tailored.lang.${language}`);
                return (
                  <li key={language}>
                    <span>{name}</span>
                    {copy && <button type="button" className="link" onClick={() => show(copy.id)}>{t("tailored.lang.open")}</button>}
                    {busy === language ? <span role="status">{t("tailored.lang.working")}</span>
                      : confirming === language ? (
                        <span className="tailored-confirm">
                          <span>{t("tailored.lang.replaceWarning", { language: name })}</span>
                          <button type="button" className="btn danger" onClick={() => void run(language)}>{t("tailored.lang.replace")}</button>
                          <button type="button" className="link" onClick={() => setConfirming(null)}>{t("tailored.lang.cancel")}</button>
                        </span>
                      ) : !copy ? (
                        <button type="button" className="btn" disabled={busy !== null} onClick={() => void run(language)}>{t("tailored.lang.translate")}</button>
                      ) : copy.translatedFrom !== null && (
                        <button type="button" className="btn" disabled={busy !== null} onClick={() => setConfirming(language)}>{t("tailored.lang.again")}</button>
                      )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const total =(score: MatchScore | null) => (score?.total ?? null) === null ? "—" : String(score!.total);

/** Tabs CV | Cover letter, the score lift and the tailored CV's actions. */
export function TailorToolbar({ tab, onTab, base, latest, template, onTemplate, children }: Props) {
  const band = latest?.band ?? base?.band;
  return (
    <div className="tailored-bar">
      <div className="tailored-tabs" role="tablist" aria-label={t("tailored.tabs")}>
        {(["cv", "letter"] as const).map((key) => (
          <button key={key} type="button" role="tab" className="secondary" aria-selected={tab === key} onClick={() => onTab(key)}>
            {t(key === "cv" ? "tailored.tab.cv" : "tailored.tab.letter")}
          </button>
        ))}
      </div>
      {band && (
        <span className="tailored-score">
          {t("tailored.score", { base: total(base), latest: total(latest ?? base), band: t(`job.score.band.${band}` as MessageKey) })}
        </span>
      )}
      <label className="tailored-template">
        <span>{t("tailored.template")}</span>
        <select value={template} onChange={(event) => onTemplate(getTemplate(event.target.value).id)}>
          {TEMPLATES.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
        </select>
      </label>
      {children}
      <button type="button" className="secondary" aria-disabled="true" title={t("tailored.soon")}>{t("tailored.export")}</button>
    </div>
  );
}
