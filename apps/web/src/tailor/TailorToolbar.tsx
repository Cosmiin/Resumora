import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { TailorLanguageSchema, type TailorLanguage } from "@resumora/shared";
import { listTailored, translate } from "./tailored-api.ts";
import { t } from "../i18n/t.ts";
import { getTemplate, type TemplateId } from "../cv/page/templates.ts";

export type TailoredTab = "cv" | "letter";

type Props = {
  tab: TailoredTab;
  onTab(tab: TailoredTab): void;
  template: TemplateId;
  /** This CV's template page and download page. */
  links: { template: string; export: string };
  /** Actions between Template and Export (Language, Re-tailor). */
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
      <button type="button" className="ui-btn ui-btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t("tailored.language")}</button>
      {open && (
        <div className="tailored-menu-pop">
          {failed && <p role="alert" className="ui-notice ui-notice--bad">{t("tailored.lang.error")}</p>}
          {copies.isPending ? <p role="status">{t("tailor.loading")}</p> : (
            <ul aria-label={t("tailored.languages")}>
              {TailorLanguageSchema.options.filter((language) => language !== current.language).map((language) => {
                const copy = copies.data?.find((item) => item.language === language);
                const name = t(`tailored.lang.${language}`);
                return (
                  <li key={language}>
                    <span>{name}</span>
                    {copy && <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => show(copy.id)}>{t("tailored.lang.open")}</button>}
                    {busy === language ? <span role="status">{t("tailored.lang.working")}</span>
                      : confirming === language ? (
                        <span className="tailored-confirm">
                          <span>{t("tailored.lang.replaceWarning", { language: name })}</span>
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void run(language)}>{t("tailored.lang.replace")}</button>
                          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => setConfirming(null)}>{t("tailored.lang.cancel")}</button>
                        </span>
                      ) : !copy ? (
                        <button type="button" className="ui-btn ui-btn--sm" disabled={busy !== null} onClick={() => void run(language)}>{t("tailored.lang.translate")}</button>
                      ) : copy.translatedFrom !== null && (
                        <button type="button" className="ui-btn ui-btn--sm" disabled={busy !== null} onClick={() => setConfirming(language)}>{t("tailored.lang.again")}</button>
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

/** Above a tailored CV: CV | Cover letter, then its template, its other languages, tailoring again, and Export. */
export function TailorToolbar({ tab, onTab, template, links, children }: Props) {
  return (
    <div className="tailored-bar" role="group" aria-label={t("tailored.toolbar")}>
      <div className="tailored-tabs" role="tablist" aria-label={t("tailored.tabs")}>
        {(["cv", "letter"] as const).map((key) => (
          <button key={key} type="button" role="tab" className="ui-btn ui-btn--sm" aria-selected={tab === key} onClick={() => onTab(key)}>
            {t(key === "cv" ? "tailored.tab.cv" : "tailored.tab.letter")}
          </button>
        ))}
      </div>
      <Link className="ui-btn ui-btn--sm" to={links.template}>{t("tailored.templateLink", { name: t(getTemplate(template).label) })}</Link>
      {children}
      <Link className="ui-btn ui-btn--primary ui-btn--sm" to={links.export}>{t("tailored.exportLink")}</Link>
    </div>
  );
}
