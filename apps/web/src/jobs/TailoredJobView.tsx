import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import type { JobExtraction, JobScore } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { getTemplate } from "../cv/page/templates.ts";
import { useCvDoc } from "../cvs/useCvDoc.ts";
import { exportFile, type ExportFormat, type ExportResult } from "../export/export-files.ts";
import { useT } from "../i18n/t.ts";
import { listTailored } from "../tailor/tailored-api.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Skeleton } from "../ui/Page.tsx";
import { recheckScore } from "./jobs-api.ts";
import { MatchNumber, mustCount, openMusts } from "./JobMatch.tsx";
import "../styles/cvs.css";

/**
 * A tailored job's page under its header: the tailored CV's latest score with the CV's actions, the job
 * itself folded into one row, then the tailored CV, read-only. A job with copies in several languages gets
 * a switch that puts the chosen copy in `?cv=`; the score answer, and with it everything here, follows.
 */
export function TailoredJobView({ jobPath, requirements, score, onScore, runStep, details }: {
  jobPath: string;
  requirements: JobExtraction["requirements"];
  /** The score answer for the copy on screen (`tailoredCvId`). */
  score: JobScore;
  /** A Re-check answered: the new score answer for the copy that was on screen when it started. */
  onScore: (next: JobScore) => void;
  /** The step line of an unfinished tailoring run; absent when none is under way. */
  runStep?: string | null;
  /** The must-haves and About this job, shown while the job row is open. */
  details: ReactNode;
}) {
  const t = useT();
  const userId = useAuth().session?.user.id ?? "anonymous";
  const { id: jobId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = useState(false);
  // Re-check, remembered with its copy so one copy's "checking" or failure never shows on another.
  const [check, setCheck] = useState<{ cv: string; state: "busy" | "failed" } | null>(null);
  // The export dialog, and the file it is making or has made.
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState<{ busy: ExportFormat | null; done: ExportResult | null; failed: boolean }>({ busy: null, done: null, failed: false });
  const cvId = score.tailoredCvId ?? undefined;
  const { doc } = useCvDoc(cvId);
  const copies = useQuery({ queryKey: ["job-tailored-list", userId, jobId], queryFn: () => listTailored(jobId), gcTime: 0 }).data ?? [];
  // The pressed language is the one just chosen, even while its score is still on the way.
  const wanted = search.get("cv");
  const shown = copies.some((copy) => copy.id === wanted) ? wanted : cvId;
  const tailored = score.tailored;
  const musts = mustCount(requirements, tailored);
  const stillOpen = openMusts(requirements, tailored);
  // The loaded CV's own links; the same addresses before it has loaded, so the buttons always work.
  const page = `${jobPath}/cv`;
  const query = cvId ? `?cv=${encodeURIComponent(cvId)}` : "";
  const links = doc.data?.links ?? { open: page + query, template: `${page}/template${query}`, export: `${page}/export${query}` };
  const checking = check && check.cv === cvId ? check.state : "idle";

  /** Makes the file in the browser from the copy on screen, as the export page does. */
  async function download(format: ExportFormat) {
    const current = doc.data;
    if (!current || file.busy !== null) return;
    setFile({ busy: format, done: null, failed: false });
    try {
      const done = await exportFile("cv", format, { cv: current.cv, job: current.job, template: current.template });
      setFile({ busy: null, done, failed: false });
    } catch {
      setFile({ busy: null, done: null, failed: true });
    }
  }

  async function recheck() {
    if (!cvId || checking === "busy") return;
    setCheck({ cv: cvId, state: "busy" });
    try {
      onScore(await recheckScore(cvId));
      setCheck(null);
    } catch {
      setCheck({ cv: cvId, state: "failed" });
    }
  }

  return <>
    <section className="job-band job-band--tailored" aria-label={t("job.band.label")}>
      <div className="job-score-latest">
        {tailored && tailored.total !== null ? <MatchNumber score={tailored} /> : (
          <div className="job-score">
            <p className="ui-label ui-muted">{t("job.match.label")}</p>
            <p className="job-score-line"><span className="job-score-num">–</span></p>
          </div>
        )}
        <p className="ui-small ui-muted">{t("job.tailored.latest")}</p>
        {score.stale && cvId && (
          <div className="job-score-stale">
            {checking === "failed" ? <p role="alert" className="ui-small">{t("job.tailored.recheckError")}</p>
              : <p className="ui-small">{t(tailored ? "job.tailored.edited" : "job.tailored.noScore")}</p>}
            <button type="button" className="ui-btn ui-btn--sm" disabled={checking === "busy"} onClick={() => void recheck()}>
              {t(checking === "busy" ? "job.tailored.checking" : checking === "failed" ? "jobs.retry" : "job.tailored.recheck")}
            </button>
          </div>
        )}
      </div>
      {musts && musts.total > 0 && (
        <p className="ui-coach job-coach">{musts.met === musts.total ? t("job.tailored.coach.all", { total: musts.total })
          : t("job.tailored.coach.some", { met: musts.met, total: musts.total, open: stillOpen.slice(0, 2).join(", ")
            + (stillOpen.length > 2 ? t("job.tailored.coach.more", { n: stillOpen.length - 2 }) : "") })}</p>
      )}
      <div className="job-tailor">
        {runStep ? <>
          <Link className="ui-btn ui-btn--primary" to={`${jobPath}/tailor`}>{t("job.tailor.continue")}</Link>
          <p className="ui-small ui-muted">{runStep}</p>
        </> : <Link className="ui-btn ui-btn--primary" to={links.open}>{t("job.tailored.edit")}</Link>}
        <div className="ui-row">
          {runStep && <Link className="ui-btn" to={links.open}>{t("job.tailored.edit")}</Link>}
          <button type="button" className="ui-btn" disabled={!doc.data}
            onClick={() => { setFile({ busy: null, done: null, failed: false }); setExporting(true); }}>{t("job.tailored.export")}</button>
          {!runStep && <Link className="ui-btn" to={`${links.open}${links.open.includes("?") ? "&" : "?"}retailor=1`}>{t("job.tailor.again")}</Link>}
        </div>
      </div>
    </section>

    {/* Export, here on the page: the copy on screen as a PDF or a Word file, in its saved template. Nothing else to choose. */}
    <Dialog open={exporting} onClose={() => { if (file.busy === null) setExporting(false); }} title={t("cvs.export.title")}
      actions={<button type="button" className="ui-btn ui-btn--quiet" disabled={file.busy !== null} onClick={() => setExporting(false)}>{t("ui.close")}</button>}>
      <div className="job-export">
        {(["pdf", "docx"] as const).map((format) => (
          <button type="button" key={format} className={format === "pdf" ? "ui-btn ui-btn--primary" : "ui-btn"} disabled={file.busy !== null}
            onClick={() => void download(format)}>
            {file.busy === format ? <><span className="cvs-spinner" aria-hidden="true" />{t(format === "pdf" ? "cvs.export.pdfWorking" : "cvs.export.wordWorking")}</>
              : t(format === "pdf" ? "cvs.export.pdf" : "cvs.export.word")}
          </button>
        ))}
      </div>
      {file.done?.tightened && file.done.fits !== false && <p className="ui-notice ui-notice--info" role="status">{t("cvs.export.tightened")}</p>}
      {file.done?.fits === false && <p className="ui-notice" role="status">{t("export.tooLong", { pages: file.done.pages ?? 0 })}</p>}
      {file.done && <p className="ui-notice ui-notice--good" role="status">{t("cvs.export.done", { name: file.done.name })}</p>}
      {file.failed && <p className="ui-notice ui-notice--bad" role="alert">{t("cvs.export.failed")}</p>}
    </Dialog>

    <button type="button" className="job-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{t("job.tailored.fold")}</span><span>{t(open ? "job.tailored.hide" : "job.tailored.show")}</span>
    </button>
    {open && <div className="job-cols job-fold-body">{details}</div>}

    <div className="job-cvbar">
      {copies.length > 1 && (
        <div className="job-lang" role="group" aria-label={t("job.tailored.language")}>
          {copies.map((copy) => (
            <button type="button" key={copy.id} aria-pressed={copy.id === shown}
              onClick={() => setSearch({ cv: copy.id }, { replace: true })}>{t(`tailored.lang.${copy.language}`)}</button>
          ))}
        </div>
      )}
      <p className="ui-small">
        {doc.data && <>{t("job.tailored.template", { name: t(getTemplate(doc.data.template).label) })} · </>}
        <Link to={links.template}>{t("job.tailored.changeTemplate")}</Link>
      </p>
    </div>
    {doc.isPending ? (
      <div className="ui-sheet ui-stack" aria-busy="true">
        <span className="ui-sr" role="status">{t("app.loading")}</span>
        <Skeleton width="60%" height="28px" /><Skeleton /><Skeleton width="80%" />
      </div>
    ) : doc.data ? (
      <div className="cvs-preview job-cv" lang={doc.data.cv.language}>
        <CvDocument content={doc.data.cv.content} template={doc.data.template} />
      </div>
    ) : (
      <div className="ui-stack">
        <p role="alert" className="ui-notice ui-notice--bad">{t(doc.isError ? "job.tailored.cvError" : "tailored.none")}</p>
        {doc.isError && <div className="ui-row"><button type="button" className="ui-btn" onClick={() => void doc.refetch()}>{t("jobs.retry")}</button></div>}
      </div>
    )}
  </>;
}
