import { useEffect, useRef } from "react";
import type { CvContent } from "@resumora/shared";
import { useMyCv } from "../cv/CvPage.tsx";
import { useRoleScores } from "../cv/enrich/useRoleScores.ts";
import { t } from "../i18n/t.ts";

export const WEAK_AVG = 60;
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

function CheckCv({ cv, onTailor, onEnrich }: Props & { cv: CvContent }) {
  const { scores } = useRoleScores({ cv, status: "saved" });
  const newest = [...cv.experience].sort((a, b) => Number(b.current) - Number(a.current)
    || (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate) || b.startDate.localeCompare(a.startDate))[0];
  const numbers = cv.experience.flatMap((role) => {
    const score = scores.get(role.id)?.result?.score;
    return typeof score === "number" ? [score] : [];
  });
  const missingFacts = !newest?.facts?.items.some((item) => item.trim());
  const unknown = cv.experience.some((role) => {
    const state = scores.get(role.id)?.state;
    return state !== "ready" && state !== "none";
  });
  const weak = unknown || missingFacts || !numbers.length || numbers.reduce((sum, n) => sum + n, 0) / numbers.length < WEAK_AVG;
  useEffect(() => { if (!weak) onTailor(); }, [weak, onTailor]);
  if (!weak) return <p role="status">{t("job.gate.checking")}</p>;
  return <>
    <p>{t("job.gate.text")}</p>
    <div className="jobs-dialog-actions">
      <button type="button" onClick={onEnrich}>{t("job.gate.enrich")}</button>
      <button type="button" className="secondary" onClick={onTailor}>{t("job.gate.anyway")}</button>
    </div>
  </>;
}
