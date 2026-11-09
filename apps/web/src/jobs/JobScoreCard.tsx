import { useId, useState } from "react";
import type { MatchScore } from "@resumora/shared";
import { t } from "../i18n/t.ts";

/** "How is this scored?": the weighted points behind the base match, under the requirements list. */
export function JobScoreHow({ score }: { score: MatchScore }) {
  const [showPoints, setShowPoints] = useState(false);
  const pointsId = useId();
  return <div className="job-score-how">
    <button type="button" className="link" aria-expanded={showPoints} aria-controls={pointsId}
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
  </div>;
}
