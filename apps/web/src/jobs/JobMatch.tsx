import { useId, useState, type ReactNode } from "react";
import type { JobExtraction, MatchLabel, MatchScore } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { Progress } from "../ui/Progress.tsx";
import { JobScoreHow } from "./JobScoreCard.tsx";

type Requirements = JobExtraction["requirements"];
export type MatchStatus = "met" | "partial" | "missing";

/** An inferred match counts as partly met until the person confirms it during tailoring. */
const statusOf = (label: MatchLabel | undefined): MatchStatus => (label?.inferred ? "partial" : label?.status ?? "missing");
const labelFor = (score: MatchScore, index: number) => score.labels.find((item) => item.kind === "requirement" && item.ref === `r${index}`);

/**
 * Whether the score's marks still line up with the requirement lines: an edit after scoring changes the
 * count, and then no line is marked.
 */
export function marksUsable(requirements: Requirements, score: MatchScore | null): score is MatchScore {
  return !!score && score.total !== null && score.labels.filter((label) => label.kind === "requirement").length === requirements.length;
}

/** How many must-haves the CV already shows, out of how many the ad lists. Null when there are no usable marks. */
export function mustCount(requirements: Requirements, score: MatchScore | null): { met: number; total: number } | null {
  if (!marksUsable(requirements, score)) return null;
  const musts = requirements.map((r, index) => ({ r, index })).filter(({ r }) => r.kind === "must");
  return { met: musts.filter(({ index }) => statusOf(labelFor(score, index)) === "met").length, total: musts.length };
}

type MustProps = {
  requirements: Requirements;
  /** The base match, or null while it is loading or failed. */
  score: MatchScore | null;
  /** The loading / retry line shown while there is no score. */
  state?: ReactNode;
};

/** The ad's must-haves in ad order. A filled dot means the CV already shows it; a line opens to the CV's own words. */
export function MustHaves({ requirements, score, state }: MustProps) {
  const t = useT();
  const headingId = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const musts = requirements.map((requirement, index) => ({ requirement, index })).filter(({ requirement }) => requirement.kind === "must");
  const marked = marksUsable(requirements, score);
  const edited = !!score && score.total !== null && !marked;
  return (
    <section className="ui-sheet ui-stack">
      <h2 className="ui-heading" id={headingId}>{t("job.must.title")}</h2>
      <p className="ui-muted ui-small">{t("job.must.hint")}</p>
      {!score && state}
      {score?.total === null && <p className="ui-notice">{t("job.score.notEnough")}</p>}
      {edited && <p className="ui-notice">{t("job.asks.edited")}</p>}
      {musts.length === 0 ? <p className="ui-muted">{t("job.none")}</p> : (
        <ul className="job-musts" aria-labelledby={headingId}>
          {musts.map(({ requirement, index }) => {
            if (!marked) return <li key={index}><span className="job-dot" aria-hidden="true" /><span>{requirement.text}</span></li>;
            const label = labelFor(score, index);
            const status = statusOf(label);
            const line = (
              <>
                <span className={status === "met" ? "job-dot is-met" : status === "partial" ? "job-dot is-partial" : "job-dot"} role="img" aria-label={t(`job.score.status.${status}`)} />
                <span>
                  {requirement.text}
                  {status !== "missing" && <> <span className="ui-muted ui-small">{t(status === "met" ? "job.must.onCv" : "job.must.partly")}</span></>}
                </span>
              </>
            );
            if (!label?.evidence && status !== "missing") return <li key={index}>{line}</li>;
            const shown = open.has(index);
            return (
              <li key={index} className="is-open-able">
                <button type="button" className="job-must-line" aria-expanded={shown} onClick={() => setOpen((current) => {
                  const next = new Set(current);
                  if (shown) next.delete(index); else next.add(index);
                  return next;
                })}>{line}</button>
                {shown && (
                  <div className="job-must-detail">
                    {label?.evidence && <p className="ui-small"><span className="ui-muted">{t("job.must.evidence")}</span> {label.evidence}</p>}
                    {status === "missing" && <p className="ui-small ui-muted">{t("job.score.missingNext")}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {score && score.total !== null && (
        <div className="job-match-total">
          <p className="ui-small">
            {t("job.match.total", { total: score.total })}
            {score.band && <> <span className="ui-pill">{t(`job.score.band.${score.band}`)}</span></>}
          </p>
          <JobScoreHow score={score} />
        </div>
      )}
    </section>
  );
}

/** The ad's keywords: how many the CV already has, then each one, solid when it is there and dashed when it is not. */
export function Keywords({ score }: { score: MatchScore | null }) {
  const t = useT();
  const words = (score?.labels ?? []).filter((label) => label.kind === "keyword").map((label) => ({ term: label.ref.replace(/^k:/, ""), has: statusOf(label) === "met" }));
  if (words.length === 0) return null;
  const has = words.filter((w) => w.has).length;
  return (
    <section className="ui-sheet ui-stack">
      <h2 className="ui-heading">{t("job.keywords.title")}</h2>
      <Progress tone="good" label={t("job.keywords.onCv")} valueText={t("job.keywords.count", { n: has, total: words.length })} value={has} max={words.length} />
      <ul className="job-kw">
        {words.map((w) => (
          <li key={w.term} className={w.has ? "is-has" : "is-miss"}>
            {w.term}<span className="ui-sr">{t(w.has ? "job.keywords.has" : "job.keywords.miss")}</span>
          </li>
        ))}
      </ul>
      <p className="ui-muted ui-small">{t("job.keywords.legend")}</p>
    </section>
  );
}

/** What the ad calls an advantage, marked the same way as the keywords. */
export function NiceToHave({ requirements, score }: { requirements: Requirements; score: MatchScore | null }) {
  const t = useT();
  const nice = requirements.map((requirement, index) => ({ requirement, index })).filter(({ requirement }) => requirement.kind === "nice");
  if (nice.length === 0) return null;
  const marked = marksUsable(requirements, score);
  return (
    <section className="ui-sheet ui-stack">
      <h2 className="ui-heading">{t("job.nice.title")}</h2>
      <ul className="job-kw">
        {nice.map(({ requirement, index }) => {
          const has = marked && statusOf(labelFor(score, index)) === "met";
          return (
            <li key={index} className={!marked ? undefined : has ? "is-has" : "is-miss"}>
              {requirement.text}{marked && <span className="ui-sr">{t(has ? "job.keywords.has" : "job.keywords.miss")}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
