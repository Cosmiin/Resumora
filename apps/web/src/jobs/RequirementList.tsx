import { useId, useState, type ReactNode } from "react";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { JobScoreHow } from "./JobScoreCard.tsx";

type Props = {
  requirements: JobExtraction["requirements"];
  /** The base match score, or null while it is loading or failed. */
  score: MatchScore | null;
  /** The loading / retry line shown while there is no score. */
  state?: ReactNode;
};
type Status = "met" | "partial" | "missing";
const symbols: Record<Status, string> = { met: "✓", partial: "~", missing: "✗" };

/** 7A: every requirement once, in ad order, marked with the base match when there is one. */
export function RequirementList({ requirements, score, state }: Props) {
  const headingId = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  // An edit after scoring changes the requirement count, so the labels no longer line up with the lines.
  const requirementsChanged = !!score && score.labels.filter((label) => label.kind === "requirement").length !== requirements.length;
  const marked = !!score && score.total !== null && !requirementsChanged;
  return <section className="sec job-asks">
    <h2 id={headingId}>{t("job.asks.title", { n: requirements.length })}
      {score && score.total !== null && <>{t("job.asks.match", { total: score.total })}
        {score.band && <> <span className={`job-match-band is-${score.band}`}>{t(`job.score.band.${score.band}`)}</span></>}</>}
    </h2>
    {!score && state}
    {score?.total === null && <p className="jobs-note">{t("job.score.notEnough")}</p>}
    {requirementsChanged && <p className="jobs-note">{t("job.asks.edited")}</p>}
    {requirements.length === 0 ? <p className="jobs-note">{t("job.none")}</p> : <ul className="job-req-list" aria-labelledby={headingId}>
      {requirements.map((requirement, index) => {
        const nice = requirement.kind === "nice" && <span className="job-nice-tag">{t("job.asks.nice")}</span>;
        if (!marked) return <li key={index} className="job-req"><span className="job-req-text">{requirement.text}</span>{nice}</li>;
        const label = (score?.labels ?? []).find((item) => item.kind === "requirement" && item.ref === `r${index}`);
        const status: Status = label?.inferred ? "partial" : label?.status ?? "missing";
        const missingNext = requirement.kind === "must" && status === "missing";
        const line = <>
          <span className="job-match-symbol" role="img" aria-label={t(`job.score.status.${status}`)}>{symbols[status]}</span>
          <span className="job-req-text">{requirement.text}</span>{nice}
        </>;
        if (!label?.evidence && !missingNext) return <li key={index} className={`job-req job-match-${status}`}><div className="job-req-line">{line}</div></li>;
        const shown = open.has(index);
        return <li key={index} className={`job-req job-match-${status}`}>
          <button type="button" className="job-req-line" aria-expanded={shown} onClick={() => setOpen((current) => {
            const next = new Set(current);
            if (shown) next.delete(index); else next.add(index);
            return next;
          })}>{line}</button>
          {shown && <div className="job-req-detail">
            {label?.evidence && <p className="jobs-note">{label.evidence}</p>}
            {missingNext && <p className="jobs-note">{t("job.score.missingNext")}</p>}
          </div>}
        </li>;
      })}
    </ul>}
    {score && <JobScoreHow score={score} />}
  </section>;
}
