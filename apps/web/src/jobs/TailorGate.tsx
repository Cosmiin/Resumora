import { useEffect, useRef } from "react";
import type { CvContent } from "@resumora/shared";
import { useMyCv } from "../cv/CvPage.tsx";
import { useRoleScores } from "../cv/enrich/useRoleScores.ts";
import { ENRICHED_AT, averageScore } from "../cv/enrich/EnrichPath.tsx";
import { t } from "../i18n/t.ts";

type Props = { onTailor(): void; onEnrich(): void; onClose(): void };

export function TailorGate(props: Props) {
  const cv = useMyCv();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <div className="jobs-scrim" onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <div className="add-job-dialog" role="dialog" aria-modal="true" aria-labelledby="tailor-gate-title"
      tabIndex={-1} ref={dialog} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); props.onClose(); }
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
          event.preventDefault(); first?.focus();
        }
      }}>
      <h2 id="tailor-gate-title">{t("job.gate.title")}</h2>
      {cv.isPending ? <p role="status">{t("job.gate.checking")}</p> : cv.isError ? <>
        <p role="alert">{t("job.gate.loadError")}</p>
        <button type="button" onClick={() => void cv.refetch()}>{t("jobs.retry")}</button>
      </> : <CheckCv cv={cv.data.content} {...props} />}
      <button type="button" className="secondary" onClick={props.onClose}>{t("job.deleteCancel")}</button>
    </div>
  </div>;
}

/** 8A: an enriched CV goes straight to tailoring; otherwise a short dialog with the average against 80. */
function CheckCv({ cv, onTailor, onEnrich }: Props & { cv: CvContent }) {
  const enriched = cv.enrichedAt !== null;
  const { scores } = useRoleScores({ cv, status: "saved" });
  useEffect(() => { if (enriched) onTailor(); }, [enriched, onTailor]);
  if (enriched) return <p role="status">{t("job.gate.checking")}</p>;
  const average = averageScore(new Map(cv.experience.map((role) => [role.id, scores.get(role.id)?.result?.score ?? null])));
  return <>
    <p>{t("job.gate.notEnriched")}</p>
    <div className="gate-meter" role="meter" aria-label={t("job.gate.meter")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={average ?? 0}>
      <i style={{ width: `${average ?? 0}%` }} />
      <b style={{ left: `${ENRICHED_AT}%` }} />
    </div>
    <p className="fine">{average === null ? t("job.gate.notScored") : t("job.gate.average", { n: average })}</p>
    <div className="jobs-dialog-actions">
      <button type="button" onClick={onEnrich}>{t("job.gate.enrich")}</button>
      <button type="button" className="secondary" onClick={onTailor}>{t("job.gate.anyway")}</button>
    </div>
  </>;
}
