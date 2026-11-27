import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { JobExtraction, MatchScore, TailoredCv } from "@resumora/shared";
import { getTemplate } from "../cv/page/templates.ts";
import { exportFile, unreviewedItems, type ExportFormat, type ExportResult } from "../export/export-files.ts";
import { t } from "../i18n/t.ts";
import { Progress } from "../ui/index.ts";
import { ChangesList } from "./ChangesList.tsx";
import { keywordsOf } from "./KeywordsStep.tsx";
import { getTailored } from "./tailored-api.ts";

type Props = {
  jobId: string; docId: string | null; base: MatchScore | null; final: MatchScore | null; job: JobExtraction | null;
  /** Opens the questions with the answers given, to change them and tailor again; absent when nothing was asked. */
  onAnswers?(): void;
  /** The parts this tailoring could not write: they stay as the person wrote them, and are named. */
  failed?: string[];
};

/** The job's must-haves in ad order, each with whether the tailored CV fully shows it. */
export function mustHaves(final: MatchScore | null, job: JobExtraction | null): { text: string; met: boolean }[] {
  const status = new Map((final?.labels ?? []).map((label) => [label.ref, label.status]));
  return (job?.requirements ?? []).flatMap((requirement, i) =>
    (requirement.kind === "must" ? [{ text: requirement.text, met: status.get(`r${i}`) === "met" }] : []));
}

/**
 * The result: the match before and after, what moved it, how the tailored CV stands on the ad's keywords and
 * must-haves (one it does not show is named), and where to go next.
 */
export function DoneScreen({ jobId, docId, base, final, job, onAnswers, failed = [] }: Props) {
  // The tailored CV as it stands: the list of changes reads it, an undo replaces it, a download uses it.
  const [cv, setCv] = useState<TailoredCv | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [file, setFile] = useState<ExportResult | "failed" | null>(null);
  // An undo or a headline picked here changes the CV after its match was worked out.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!docId) return;
    let live = true;
    getTailored(docId).then((doc) => { if (live) setCv(doc); }, () => {});
    return () => { live = false; };
  }, [docId]);
  const unchecked = cv ? unreviewedItems(cv.review).length : 0;
  /** The CV in its saved template, built in the browser. */
  async function download(format: ExportFormat) {
    if (!cv || busy) return;
    setBusy(format);
    setFile(null);
    try {
      setFile(await exportFile("cv", format, { cv, job, template: getTemplate(cv.template).id }));
    } catch { setFile("failed"); } finally { setBusy(null); }
  }
  const downloadButton = (format: ExportFormat, label: string, working: string, primary = false) =>
    <button type="button" className={primary ? "ui-btn ui-btn--primary" : "ui-btn"} disabled={!cv || busy !== null} onClick={() => void download(format)}>
      {busy === format ? working : label}</button>;

  const query = docId ? `?cv=${encodeURIComponent(docId)}` : "";
  const page = `/jobs/${encodeURIComponent(jobId)}/cv${query}`;
  const to = (param: string) => `${page}${docId ? "&" : "?"}${param}`;
  const musts = mustHaves(final, job);
  const open = musts.filter((must) => !must.met).length;
  const now = keywordsOf(final);
  const before = keywordsOf(base);
  const total = now.has.length + now.missing.length;

  const mustsBefore = mustHaves(base, job).filter((must) => must.met).length;
  const diff = (final?.total ?? 0) - (base?.total ?? final?.total ?? 0);

  return <section className="tailor-result">
    <h1 className="ui-title">{musts.length === 0 ? t("tailor.finish.titlePlain")
      : open === 0 ? t("tailor.finish.titleMet") : t(open === 1 ? "tailor.finish.titleOpenOne" : "tailor.finish.titleOpenMany", { n: open })}</h1>
    <p className="ui-lead">{musts.length === 0 ? t("tailor.finish.leadPlain") : t(open === 0 ? "tailor.finish.leadMet" : "tailor.finish.leadOpen")}</p>
    {final && <div className="tailor-result-cards">
      <div className="ui-sheet tailor-result-card">
        <p className="ui-label">{t("tailor.result.match")}</p>
        <p className="tailor-bigscore">
          {base && diff !== 0 ? <><s>{base.total}</s> <span aria-hidden="true">→</span> <b className={diff > 0 ? "is-up" : undefined}>{final.total}</b></> : <b>{final.total}</b>}
        </p>
        {base && <p>{diff === 0 ? t("tailor.result.same") : t(diff === 1 ? "tailor.result.betterOne" : diff > 0 ? "tailor.result.better" : diff === -1 ? "tailor.result.lowerOne" : "tailor.result.lower", { n: Math.abs(diff) })}</p>}
      </div>
      {base && (total > 0 || musts.length > 0) && <div className="ui-sheet tailor-result-card">
        <p className="ui-label">{t("tailor.result.moved")}</p>
        <ul>
          {total > 0 && <li>{t("tailor.result.keywords", { a: before.has.length, b: now.has.length, total })}</li>}
          {musts.length > 0 && <li>{t("tailor.result.musts", { a: mustsBefore, b: musts.length - open, total: musts.length })}</li>}
        </ul>
      </div>}
    </div>}
    {unchecked > 0 && <p className="ui-notice tailor-gap">
      {t(unchecked === 1 ? "tailor.done.checkOne" : "tailor.done.checkMany", { n: unchecked })}{" "}
      <Link to={to("review=1")}>{t("tailor.done.review")}</Link>
    </p>}
    {file === "failed" && <p className="ui-notice ui-notice--bad tailor-gap" role="alert">{t("cvs.export.failed")}</p>}
    {file && file !== "failed" && <p className="ui-notice ui-notice--good tailor-gap" role="status">{t("cvs.export.done", { name: file.name })}</p>}
    <nav aria-label={t("tailor.done.next")} className="tailor-downloads tailor-gap">
      {downloadButton("pdf", t("cvs.export.pdf"), t("cvs.export.pdfWorking"), true)}
      {downloadButton("docx", t("cvs.export.word"), t("cvs.export.wordWorking"))}
      <Link className="ui-small" to={`/jobs/${encodeURIComponent(jobId)}/cv/export${query}`}>{t("tailor.done.template")}</Link>
      <Link className="ui-btn" to={page}>{t("tailor.finish.open")}</Link>
      <Link className="ui-btn ui-btn--quiet" to={to("tab=letter")}>{t("tailor.done.letter")}</Link>
      {onAnswers && <button type="button" className="ui-btn ui-btn--quiet" onClick={onAnswers}>{t("tailor.done.changeAnswers")}</button>}
    </nav>
    {failed.length > 0 && <p className="ui-notice tailor-gap" role="status">
      {t(failed.length === 1 ? "tailor.done.failedOne" : "tailor.done.failedMany", { n: failed.length, list: failed.join(", ") })}</p>}
    {cv && <ChangesList cv={cv} onChange={(next) => { setCv(next); setEdited(true); }} />}
    {edited && <p className="ui-small ui-muted tailor-gap">{t("tailor.changes.scoreOld")}{" "}
      <Link to={`/jobs/${encodeURIComponent(jobId)}`}>{t("tailor.changes.scoreOldLink")}</Link></p>}
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
  </section>;
}
