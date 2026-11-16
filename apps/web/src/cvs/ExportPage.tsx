import { useState } from "react";
import { Link, useParams } from "react-router";
import { getTemplate } from "../cv/page/templates.ts";
import { exportFile, unreviewedItems, type ExportFormat, type ExportKind, type ExportResult } from "../export/export-files.ts";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { DocCrumb, DocState } from "./TemplatePage.tsx";
import { useCvDoc } from "./useCvDoc.ts";
import "../styles/cvs.css";

type Busy = `${ExportKind}:${ExportFormat}`;

/** `/cv/export` and `/jobs/:id/cv/export`: the CV as a PDF or a Word file, made in the browser. */
export function ExportPage() {
  const t = useT();
  const { doc } = useCvDoc();
  const { id: jobId } = useParams();
  const [busy, setBusy] = useState<Busy | null>(null);
  const [done, setDone] = useState<ExportResult | null>(null);
  const [failed, setFailed] = useState(false);

  if (doc.isPending) return <DocState state="loading" onRetry={() => {}} />;
  if (doc.isError || !doc.data) return <DocState state={doc.isError ? "error" : "none"} onRetry={() => void doc.refetch()} />;
  const current = doc.data;
  const unreviewed = current.tailored ? unreviewedItems(current.tailored.review) : [];
  const letter = current.cv.coverLetter !== null;

  async function run(kind: ExportKind, format: ExportFormat) {
    if (busy) return;
    setBusy(`${kind}:${format}`);
    setDone(null);
    setFailed(false);
    try {
      setDone(await exportFile(kind, format, { cv: current.cv, job: current.job, template: current.template }));
    } catch { setFailed(true); } finally { setBusy(null); }
  }
  const button = (kind: ExportKind, format: ExportFormat, label: string, working: string, primary = false) =>
    <button type="button" className={primary ? "ui-btn ui-btn--primary" : "ui-btn"} disabled={busy !== null} onClick={() => void run(kind, format)}>
      {busy === `${kind}:${format}` ? <><span className="cvs-spinner" aria-hidden="true" />{working}</> : label}</button>;

  return <AppShell>
    <main className="ui-page cvs-page">
      <div className="ui-wrap ui-main cvs-narrow">
        <DocCrumb doc={current} />
        <h1 className="ui-title">{t("cvs.export.title")}</h1>
        <p className="ui-lead cvs-lead">{t("cvs.export.lead")}</p>
        {unreviewed.length > 0 && <p className="ui-notice cvs-gap" role="note">
          {t(unreviewed.length === 1 ? "export.guessesOne" : "export.guessesMany", { count: unreviewed.length })}{" "}
          <Link to={`${current.links.open}&review=1`}>{t(unreviewed.length === 1 ? "export.reviewOne" : "export.reviewMany", { count: unreviewed.length })}</Link>
        </p>}
        <div className="ui-sheet ui-stack">
          <div className="ui-row ui-row--between">
            <div><p className="ui-label">{t("cvs.export.template")}</p><p>{t(getTemplate(current.template).label)}</p></div>
            <Link className="ui-btn ui-btn--sm" to={current.links.template}>{t("cvs.export.change")}</Link>
          </div>
          <hr className="cvs-divider" />
          <div className="cvs-formats">
            <div className="ui-block ui-block--raised cvs-format"><h2 className="ui-heading">PDF</h2><p className="ui-small ui-muted">{t("cvs.export.pdfAbout")}</p>
              {button("cv", "pdf", t("cvs.export.pdf"), t("cvs.export.pdfWorking"), true)}</div>
            <div className="ui-block ui-block--raised cvs-format"><h2 className="ui-heading">Word</h2><p className="ui-small ui-muted">{t("cvs.export.wordAbout")}</p>
              {button("cv", "docx", t("cvs.export.word"), t("cvs.export.wordWorking"))}</div>
          </div>
          {letter && <div className="ui-row cvs-letter">
            <span className="ui-label">{t("cvs.export.letter")}</span>
            {button("letter", "pdf", "PDF", t("export.working"))}
            {button("letter", "docx", "Word", t("export.working"))}
          </div>}
          {done?.tightened && done.fits !== false && <p className="ui-notice ui-notice--info" role="status">{t("cvs.export.tightened")}</p>}
          {done?.fits === false && <p className="ui-notice" role="status">{t("export.tooLong", { pages: done.pages ?? 0 })}</p>}
          {done && <p className="ui-notice ui-notice--good" role="status">{t("cvs.export.done", { name: done.name })}</p>}
          {failed && <p className="ui-notice ui-notice--bad" role="alert">{t("cvs.export.failed")}</p>}
        </div>
        {done && <>
          <p className="ui-coach cvs-after">{t(current.kind === "tailored" ? "cvs.export.luck" : "cvs.export.luckBase")}</p>
          <p className="ui-row">{current.kind === "tailored" && jobId
            ? <Link className="ui-btn" to={`/jobs/${encodeURIComponent(jobId)}`}>{t("cvs.toJob")}</Link>
            : <Link className="ui-btn" to="/cv">{t("cvs.toBase")}</Link>}</p>
        </>}
      </div>
    </main>
  </AppShell>;
}
