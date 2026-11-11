import { useId, useState, type ReactNode } from "react";
import type { JobExtraction, MatchLabel, MatchScore } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { Progress } from "../ui/Progress.tsx";

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
  /** Shown at the end of the sheet: the nice-to-haves. */
  children?: ReactNode;
};

/** The base match as a number out of 100 with its band and a bar. Read aloud as one sentence. */
export function MatchNumber({ score }: { score: MatchScore }) {
  const t = useT();
  if (score.total === null) return null;
  return (
    <div className="job-score">
      <p className="ui-label ui-muted" aria-hidden="true">{t("job.match.label")}</p>
      <p className="job-score-line">
        <span className="ui-sr">{t("job.match.total", { total: score.total })}</span>
        <span className="job-score-num" aria-hidden="true">{score.total} <small>{t("job.match.of")}</small></span>
        {score.band && <span className="ui-pill">{t(`job.score.band.${score.band}`)}</span>}
      </p>
      <div className="gate-meter job-score-meter" aria-hidden="true"><i style={{ width: `${score.total}%` }} /></div>
    </div>
  );
}

/**
 * The ad's must-haves. With a score they are sorted so the gaps come first: not on the CV, partly on it, then
 * the ones already there as green tags. A line or tag opens to the CV's own words. Without a score they are
 * listed plain, in ad order.
 */
export function MustHaves({ requirements, score, state, children }: MustProps) {
  const t = useT();
  const headingId = useId();
  const groupId = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const musts = requirements.map((requirement, index) => ({ requirement, index })).filter(({ requirement }) => requirement.kind === "must");
  const marked = marksUsable(requirements, score);
  const edited = !!score && score.total !== null && !marked;
  const toggle = (index: number) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(index)) next.add(index);
    return next;
  });
  const rows = marked ? musts.map(({ requirement, index }) => {
    const label = labelFor(score, index);
    return { text: requirement.text, index, evidence: label?.evidence ?? null, status: statusOf(label) };
  }) : [];
  type Row = (typeof rows)[number];
  const line = (row: Row) => {
    const inner = (
      <>
        <span className={row.status === "partial" ? "job-dot is-partial" : "job-dot"} role="img" aria-label={t(`job.score.status.${row.status}`)} />
        <span>{row.text}</span>
      </>
    );
    if (!row.evidence && row.status !== "missing") return <li key={row.index}>{inner}</li>;
    const shown = open.has(row.index);
    return (
      <li key={row.index} className="is-open-able">
        <button type="button" className="job-must-line" aria-expanded={shown} onClick={() => toggle(row.index)}>{inner}</button>
        {shown && (
          <div className="job-must-detail">
            {row.evidence && <p className="ui-small"><span className="ui-muted">{t("job.must.evidence")}</span> {row.evidence}</p>}
            {row.status === "missing" && <p className="ui-small ui-muted">{t("job.score.missingNext")}</p>}
          </div>
        )}
      </li>
    );
  };
  const met = rows.filter((row) => row.status === "met");
  return (
    <section className="ui-sheet ui-stack">
      <h2 className="ui-heading" id={headingId}>{t("job.must.title")}</h2>
      <p className="ui-muted ui-small">{t(marked ? "job.must.hintSorted" : "job.must.hint")}</p>
      {!score && state}
      {score?.total === null && <p className="ui-notice">{t("job.score.notEnough")}</p>}
      {edited && <p className="ui-notice">{t("job.asks.edited")}</p>}
      {musts.length === 0 ? <p className="ui-muted">{t("job.none")}</p> : !marked ? (
        <ul className="job-musts" aria-labelledby={headingId}>
          {musts.map(({ requirement, index }) => <li key={index}><span className="job-dot" aria-hidden="true" /><span>{requirement.text}</span></li>)}
        </ul>
      ) : (
        <>
          {(["missing", "partial"] as const).map((status) => {
            const items = rows.filter((row) => row.status === status);
            return items.length > 0 && (
              <div className="job-grp" key={status}>
                <h3 id={`${groupId}-${status}`}>{t(`job.must.group.${status}`, { n: items.length })}</h3>
                <ul className="job-musts" aria-labelledby={`${groupId}-${status}`}>{items.map(line)}</ul>
              </div>
            );
          })}
          {met.length > 0 && (
            <div className="job-grp">
              <h3 id={`${groupId}-met`}>{t("job.must.group.met", { n: met.length })}</h3>
              <ul className="job-kw" aria-labelledby={`${groupId}-met`}>
                {met.map((row) => (
                  <li key={row.index} className="is-has">
                    {row.evidence
                      ? <button type="button" className="job-chip" aria-expanded={open.has(row.index)} onClick={() => toggle(row.index)}>{row.text}</button>
                      : row.text}
                  </li>
                ))}
              </ul>
              {met.filter((row) => row.evidence && open.has(row.index)).map((row) => (
                <p key={row.index} className="ui-small job-chip-detail"><b>{row.text}.</b> <span className="ui-muted">{t("job.must.evidence")}</span> {row.evidence}</p>
              ))}
            </div>
          )}
        </>
      )}
      {children}
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

/** What the ad calls an advantage, marked the same way as the keywords. `inside` makes it a group of another sheet. */
export function NiceToHave({ requirements, score, inside = false }: { requirements: Requirements; score: MatchScore | null; inside?: boolean }) {
  const t = useT();
  const nice = requirements.map((requirement, index) => ({ requirement, index })).filter(({ requirement }) => requirement.kind === "nice");
  if (nice.length === 0) return null;
  const marked = marksUsable(requirements, score);
  const list = (
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
  );
  if (inside) return <div className="job-grp"><h3>{t("job.nice.title")}</h3>{list}</div>;
  return (
    <section className="ui-sheet ui-stack">
      <h2 className="ui-heading">{t("job.nice.title")}</h2>
      {list}
    </section>
  );
}
