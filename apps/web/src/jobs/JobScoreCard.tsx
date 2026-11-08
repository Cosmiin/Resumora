import { useId, useState } from "react";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { t } from "../i18n/t.ts";

type Props = { score: MatchScore; requirements: JobExtraction["requirements"] };
const symbols = { met: "✓", partial: "~", missing: "✗" } as const;

export function JobScoreCard({ score, requirements }: Props) {
  const [showPoints, setShowPoints] = useState(false);
  const pointsId = useId();
  const requirementsChanged = score.labels.filter((label) => label.kind === "requirement").length !== requirements.length;
  const rows = requirements.map((requirement, index) => {
    const label = score.labels.find((item) => item.kind === "requirement" && item.ref === `r${index}`);
    const status = label?.inferred ? "partial" : label?.status ?? "missing";
    return { requirement, label, status };
  });
  const missing = rows.filter(({ requirement, status }) => requirement.kind === "must" && status === "missing").length;
  return <section className="job-score" aria-label={t("job.score.title")}>
    <h2>{t("job.score.title")}</h2>
    {score.total === null ? <p>{t("job.score.notEnough")}</p> : <>
      <div className="job-score-total"><strong>{score.total}<small>{t("job.score.outOf")}</small></strong>
        {score.band && <span className={`job-match-band is-${score.band}`}>{t(`job.score.band.${score.band}`)}</span>}
      </div>
      {requirementsChanged ? <p className="jobs-note">{t("job.score.requirementsEdited")}</p> : <>
      <p>{t("job.score.missingMusts", { n: missing })}</p>
      <ul className="job-score-requirements">
        {rows.map(({ requirement, label, status }, index) => <li key={index} className={`job-match-${status}`}>
          <span className="job-match-symbol" aria-label={t(`job.score.status.${status}`)}>{symbols[status]}</span>
          <div><strong>{requirement.text}</strong> <span className="jobs-note">{t(`job.${requirement.kind}`)}</span>
            {label?.evidence && <p className="jobs-note">{label.evidence}</p>}
            {requirement.kind === "must" && status === "missing" && <p className="jobs-note">{t("job.score.missingNext")}</p>}
          </div>
        </li>)}
      </ul>
      </>}
    </>}
    <button type="button" className="secondary" aria-expanded={showPoints} aria-controls={pointsId}
      onClick={() => setShowPoints(!showPoints)}>{t("job.score.how")}</button>
    {showPoints && <div id={pointsId}>
      <dl className="job-score-points">
        {(["requirements", "keywords", "seniority", "langEdu"] as const).map((key) => {
          const part = score.parts[key];
          return <div key={key}><dt>{t(`job.score.part.${key}`)}</dt>
            <dd>{part ? t("job.score.points", { points: Math.round(part.points * part.max * 10) / 10, max: Math.round(part.max * 10) / 10 })
              : t("job.score.notScored")}</dd></div>;
        })}
      </dl>
      {score.capped && <p className="jobs-note">{t("job.score.capped")}</p>}
    </div>}
  </section>;
}
