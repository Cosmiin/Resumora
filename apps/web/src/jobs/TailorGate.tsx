import { useEffect } from "react";
import type { CvContent } from "@resumora/shared";
import { useMyCv } from "../cv/CvPage.tsx";
import { useRoleScores } from "../cv/enrich/useRoleScores.ts";
import { ENRICHED_AT, averageScore, strengthWeights } from "../cv/enrich/EnrichPath.tsx";
import { useT } from "../i18n/t.ts";
import { Dialog } from "../ui/Dialog.tsx";

type Props = { onTailor(): void; onEnrich(): void; onClose(): void };

/** Before tailoring: an enriched CV goes straight on; otherwise the person chooses to enrich first or tailor anyway. */
export function TailorGate(props: Props) {
  const t = useT();
  const cv = useMyCv();
  return (
    <Dialog open onClose={props.onClose} title={t("job.gate.title")}>
      {cv.isPending ? <p role="status">{t("job.gate.checking")}</p> : cv.isError ? (
        <>
          <p role="alert" className="ui-notice ui-notice--bad">{t("job.gate.loadError")}</p>
          <div className="ui-dialog-actions">
            <button type="button" className="ui-btn ui-btn--quiet" onClick={props.onClose}>{t("job.deleteCancel")}</button>
            <button type="button" className="ui-btn" onClick={() => void cv.refetch()}>{t("jobs.retry")}</button>
          </div>
        </>
      ) : <CheckCv cv={cv.data.content} {...props} />}
    </Dialog>
  );
}

function CheckCv({ cv, onTailor, onEnrich, onClose }: Props & { cv: CvContent }) {
  const t = useT();
  const enriched = cv.enrichedAt !== null;
  const { scores } = useRoleScores({ cv, status: "saved" });
  useEffect(() => { if (enriched) onTailor(); }, [enriched, onTailor]);
  if (enriched) return <p role="status">{t("job.gate.checking")}</p>;
  const average = averageScore(new Map(cv.experience.map((role) => [role.id, scores.get(role.id)?.result?.score ?? null])), strengthWeights(cv));
  return (
    <>
      <p>{t("job.gate.notEnriched")}</p>
      <div className="gate-meter" role="meter" aria-label={t("job.gate.meter")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={average ?? 0}>
        <i style={{ width: `${average ?? 0}%` }} />
        <b style={{ left: `${ENRICHED_AT}%` }} />
      </div>
      <p className="ui-small ui-muted">{average === null ? t("job.gate.notScored") : t("job.gate.average", { n: average })}</p>
      <div className="ui-dialog-actions">
        <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose}>{t("job.deleteCancel")}</button>
        <button type="button" className="ui-btn" onClick={onTailor}>{t("job.gate.anyway")}</button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onEnrich}>{t("job.gate.enrich")}</button>
      </div>
    </>
  );
}
