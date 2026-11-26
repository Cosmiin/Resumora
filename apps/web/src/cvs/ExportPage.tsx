import { useState } from "react";
import { Link, useParams } from "react-router";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { TEMPLATES, type TemplateId } from "../cv/page/templates.ts";
import { exportFile, unreviewedItems, type ExportFormat, type ExportKind, type ExportResult } from "../export/export-files.ts";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { Checkbox } from "../ui/index.ts";
import { DocCrumb, DocState } from "./TemplatePage.tsx";
import { useCvDoc } from "./useCvDoc.ts";
import "../styles/cvs.css";

type Busy = `${ExportKind}:${ExportFormat}`;

/**
 * `/cv/export` and `/jobs/:id/cv/export`: the template (saved when picked) beside the person's real CV in it, and the
 * CV as a PDF or a Word file, made in the browser.
 */
export function ExportPage() {
  const t = useT();
  const { doc, saveTemplate } = useCvDoc();
  const { id: jobId } = useParams();
  const [busy, setBusy] = useState<Busy | null>(null);
  const [done, setDone] = useState<ExportResult | null>(null);
  const [failed, setFailed] = useState(false);
  // The template just picked, shown while it saves; null = the saved one.
  const [picked, setPicked] = useState<TemplateId | null>(null);
  const [asDefault, setAsDefault] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");

  if (doc.isPending) return <DocState state="loading" onRetry={() => {}} />;
  if (doc.isError || !doc.data) return <DocState state={doc.isError ? "error" : "none"} onRetry={() => void doc.refetch()} />;
  const current = doc.data;
  const unreviewed = current.tailored ? unreviewedItems(current.tailored.review) : [];
  const letter = current.cv.coverLetter !== null;
  const template = picked ?? current.template;

  /** Saves a template as soon as it is picked; on a failure the saved one comes back. */
  async function choose(next: TemplateId, makeDefault: boolean) {
    setPicked(next);
    setSaving("saving");
    try {
      await saveTemplate(next, makeDefault);
      setSaving("idle");
    } catch { setSaving("error"); }
    setPicked(null);
  }
  async function run(kind: ExportKind, format: ExportFormat) {
    if (busy) return;
    setBusy(`${kind}:${format}`);
    setDone(null);
    setFailed(false);
    try {
      setDone(await exportFile(kind, format, { cv: current.cv, job: current.job, template }));
    } catch { setFailed(true); } finally { setBusy(null); }
  }
  const button = (kind: ExportKind, format: ExportFormat, label: string, working: string, primary = false) =>
    <button type="button" className={primary ? "ui-btn ui-btn--primary" : "ui-btn"} disabled={busy !== null || saving === "saving"} onClick={() => void run(kind, format)}>
      {busy === `${kind}:${format}` ? <><span className="cvs-spinner" aria-hidden="true" />{working}</> : label}</button>;

  return <AppShell>
    <main className="ui-page cvs-page">
      <div className="ui-wrap ui-main">
        <DocCrumb doc={current} />
        <h1 className="ui-title cvs-gap">{t("cvs.export.title")}</h1>
        {unreviewed.length > 0 && <p className="ui-notice cvs-gap" role="note">
          {t(unreviewed.length === 1 ? "export.guessesOne" : "export.guessesMany", { count: unreviewed.length })}{" "}
          <Link to={`${current.links.open}&review=1`}>{t(unreviewed.length === 1 ? "export.reviewOne" : "export.reviewMany", { count: unreviewed.length })}</Link>
        </p>}
        {saving === "error" && <p role="alert" className="ui-notice ui-notice--bad cvs-gap">{t("tailored.templateError")}</p>}
        <div className="cvs-gallery">
          <div className="ui-stack">
            <fieldset className="cvs-tpls">
              <legend className="ui-label">{t("cvs.export.template")}</legend>
              {TEMPLATES.map((item) => <label key={item.id} className="cvs-tpl">
                <input type="radio" name="template" value={item.id} checked={template === item.id} disabled={saving === "saving"}
                  onChange={() => void choose(item.id, asDefault)} />
                <span className={`cvs-thumb cvs-thumb--${item.id}`} aria-hidden="true"><i className="h" /><i /><i /><i style={{ width: "80%" }} /><i /><i style={{ width: "70%" }} /></span>
                <span><b>{t(item.label)}</b><br /><span className="ui-small ui-muted">{t(`cvs.template.about.${item.id}`)}</span>
                  {current.defaultTemplate === item.id && <><br /><span className="ui-pill cvs-default">{t("cvs.template.default")}</span></>}</span>
              </label>)}
              {current.kind === "tailored" && <Checkbox label={t("cvs.template.makeDefault")} checked={asDefault}
                onChange={(event) => { setAsDefault(event.target.checked); if (event.target.checked) void choose(template, true); }} />}
            </fieldset>
            <div className="ui-sheet ui-stack">
              <div className="cvs-formats cvs-formats--stack">
                {button("cv", "pdf", t("cvs.export.pdf"), t("cvs.export.pdfWorking"), true)}
                {button("cv", "docx", t("cvs.export.word"), t("cvs.export.wordWorking"))}
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
              <p className="ui-coach">{t(current.kind === "tailored" ? "cvs.export.luck" : "cvs.export.luckBase")}</p>
              <p className="ui-row">{current.kind === "tailored" && jobId
                ? <Link className="ui-btn" to={`/jobs/${encodeURIComponent(jobId)}`}>{t("cvs.toJob")}</Link>
                : <Link className="ui-btn" to="/cv">{t("cvs.toBase")}</Link>}</p>
            </>}
          </div>
          <div>
            <p className="ui-label cvs-preview-label">{t("cvs.template.preview")}</p>
            <div className="cvs-preview" aria-live="polite" lang={current.cv.language}>
              <CvDocument content={current.cv.content} template={template} />
            </div>
          </div>
        </div>
      </div>
    </main>
  </AppShell>;
}
