import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { unreviewedItems } from "../export/export-files.ts";
import { t } from "../i18n/t.ts";
import { Progress } from "../ui/index.ts";
import { keywordsOf } from "./KeywordsStep.tsx";
import { getTailored } from "./tailored-api.ts";

type Props = {
  jobId: string; docId: string | null; base: MatchScore | null; final: MatchScore | null; job: JobExtraction | null;
  /** Opens the finished roles, to change an answer; absent when there is nothing to go back to. */
  onAnswers?(): void;
};

/** The job's must-haves in ad order, each with whether the tailored CV fully shows it. */
export function mustHaves(final: MatchScore | null, job: JobExtraction | null): { text: string; met: boolean }[] {
  const status = new Map((final?.labels ?? []).map((label) => [label.ref, label.status]));
  return (job?.requirements ?? []).flatMap((requirement, i) =>
    (requirement.kind === "must" ? [{ text: requirement.text, met: status.get(`r${i}`) === "met" }] : []));
}

/**
 * The last step: how the tailored CV stands on the ad's keywords and must-haves. A must-have the CV does not
 * show is named, and the CV can still be marked as ready. Then: where to go next.
 */
export function DoneScreen({ jobId, docId, base, final, job, onAnswers }: Props) {
  const [unchecked, setUnchecked] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!docId) return;
    let live = true;
    getTailored(docId).then((cv) => { if (live) setUnchecked(unreviewedItems(cv.review).length); }, () => {});
    return () => { live = false; };
  }, [docId]);

  const query = docId ? `?cv=${encodeURIComponent(docId)}` : "";
  const page = `/jobs/${encodeURIComponent(jobId)}/cv${query}`;
  const to = (param: string) => `${page}${docId ? "&" : "?"}${param}`;
  const musts = mustHaves(final, job);
  const open = musts.filter((must) => !must.met).length;
  const now = keywordsOf(final);
  const before = keywordsOf(base);
  const total = now.has.length + now.missing.length;

  if (ready) {
    return <section className="ui-stack tailor-narrow">
      <h1 className="ui-title">{t("tailor.finish.readyTitle")}</h1>
      <p className="ui-notice ui-notice--good" role="status">{t("tailor.finish.ready")}</p>
      <p className="ui-coach">{t("tailor.finish.readyNext")}</p>
      <nav aria-label={t("tailor.done.next")} className="ui-row">
        <Link className="ui-btn ui-btn--primary" to={`/jobs/${encodeURIComponent(jobId)}/cv/template${query}`}>{t("cvs.template.title")}</Link>
        <Link className="ui-btn" to={page}>{t("tailor.finish.open")}</Link>
        <Link className="ui-btn ui-btn--quiet" to={to("tab=letter")}>{t("tailor.done.letter")}</Link>
      </nav>
    </section>;
  }

  return <section className="tailor-narrow">
    <h1 className="ui-title">{musts.length === 0 ? t("tailor.finish.titlePlain")
      : open === 0 ? t("tailor.finish.titleMet") : t(open === 1 ? "tailor.finish.titleOpenOne" : "tailor.finish.titleOpenMany", { n: open })}</h1>
    <p className="ui-lead">{musts.length === 0 ? t("tailor.finish.leadPlain") : t(open === 0 ? "tailor.finish.leadMet" : "tailor.finish.leadOpen")}</p>
    <div className="ui-sheet ui-stack tailor-finish">
      {total > 0 && <>
        <Progress tone="good" label={t("tailor.kw.bar")} valueText={t("tailor.kw.count", { n: now.has.length, total })} value={now.has.length} max={total} />
        <p className="ui-coach ui-coach--sm">
          {base && now.has.length > before.has.length ? `${t("tailor.finish.upFrom", { n: before.has.length })} ` : ""}
          {now.missing.length > 0 ? t("tailor.finish.stillMissing", { list: now.missing.join(", ") }) : t("tailor.finish.noneMissing")}
        </p>
      </>}
      {musts.length > 0 && <>
        {total > 0 && <hr className="ui-divider" />}
        <h2 className="ui-heading" id="tailor-finish-musts">{t("tailor.finish.musts")}</h2>
        <ul className="tailor-musts" aria-labelledby="tailor-finish-musts">
          {musts.map((must, i) => <li key={i}>
            <span className={must.met ? "tailor-dot is-met" : "tailor-dot"} aria-hidden="true" />
            {must.met ? <span>{must.text} <span className="ui-small ui-muted">{t("tailor.finish.covered")}</span></span>
              : <span className="ui-stack ui-stack--s">
                <span><b>{must.text}</b> <span className="ui-pill ui-pill--bad">{t("tailor.finish.notCovered")}</span></span>
                {onAnswers && <span><button type="button" className="ui-btn ui-btn--sm" onClick={onAnswers}>{t("tailor.finish.changeAnswer")}</button></span>}
              </span>}
          </li>)}
        </ul>
      </>}
    </div>
    {unchecked > 0 && <p className="ui-notice tailor-gap">
      {t(unchecked === 1 ? "tailor.done.checkOne" : "tailor.done.checkMany", { n: unchecked })}{" "}
      <Link to={to("review=1")}>{t("tailor.done.review")}</Link>
    </p>}
    <div className="tailor-foot">
      <span />
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => setReady(true)}>{t(open > 0 ? "tailor.finish.markAnyway" : "tailor.finish.mark")}</button>
    </div>
  </section>;
}
