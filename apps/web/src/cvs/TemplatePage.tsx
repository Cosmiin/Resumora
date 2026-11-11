import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { TEMPLATES, type TemplateId } from "../cv/page/templates.ts";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { Checkbox, Skeleton } from "../ui/index.ts";
import { jobName, useCvDoc, type CvDoc } from "./useCvDoc.ts";
import "../styles/cvs.css";

/** Under the page: which CV this is about. */
export function DocCrumb({ doc }: { doc: CvDoc }) {
  const t = useT();
  const name = jobName(doc.job?.title, doc.job?.company);
  return <p className="ui-small ui-muted cvs-crumb">
    {doc.kind === "base" ? <Link to={doc.links.open}>{t("cvs.base")}</Link>
      : <>{t("cvs.tailoredFor")}: <Link to={doc.links.open}>{name || t("cvs.untitledJob")}</Link></>}
  </p>;
}

/** What every page about one CV shows while it loads, when it fails, and when the job has no tailored CV. */
export function DocState({ state, onRetry }: { state: "loading" | "error" | "none"; onRetry(): void }) {
  const t = useT();
  return <AppShell><main className="ui-page cvs-page"><div className="ui-wrap ui-main">
    {state === "loading" ? <div className="ui-stack" aria-busy="true"><p role="status" className="ui-sr">{t("cvs.loading")}</p>
      <Skeleton width="40%" height="40px" /><Skeleton height="220px" /></div>
      : <div className="ui-stack"><p role="alert" className="ui-notice ui-notice--bad">{t(state === "error" ? "cvs.loadError" : "tailored.none")}</p>
        <p className="ui-row">{state === "error" && <button type="button" className="ui-btn" onClick={onRetry}>{t("tailor.retry")}</button>}
          <Link className="ui-btn ui-btn--quiet" to="/cvs">{t("cvs.toAll")}</Link></p></div>}
  </div></main></AppShell>;
}

/** `/cv/template` and `/jobs/:id/cv/template`: the templates beside the person's real CV in the one picked. */
export function TemplatePage() {
  const t = useT();
  const navigate = useNavigate();
  const { doc, saveTemplate } = useCvDoc();
  const [picked, setPicked] = useState<TemplateId | null>(null);
  const [asDefault, setAsDefault] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  if (doc.isPending) return <DocState state="loading" onRetry={() => {}} />;
  if (doc.isError || !doc.data) return <DocState state={doc.isError ? "error" : "none"} onRetry={() => void doc.refetch()} />;
  const current = doc.data;
  const template = picked ?? current.template;

  async function use() {
    setState("saving");
    try {
      await saveTemplate(template, asDefault);
      void navigate(current.links.export);
    } catch { setState("error"); }
  }

  return <AppShell>
    <main className="ui-page cvs-page">
      <div className="ui-wrap ui-main">
        <DocCrumb doc={current} />
        <div className="cvs-head">
          <div><h1 className="ui-title">{t("cvs.template.title")}</h1><p className="ui-lead">{t("cvs.template.lead")}</p></div>
          <button type="button" className="ui-btn ui-btn--primary" disabled={state === "saving"} onClick={() => void use()}>
            {t(state === "saving" ? "tailor.review.saving" : "cvs.template.use")}</button>
        </div>
        {state === "error" && <p role="alert" className="ui-notice ui-notice--bad cvs-gap">{t("tailored.templateError")}</p>}
        <div className="cvs-gallery">
          <fieldset className="cvs-tpls">
            <legend className="ui-sr">{t("cvs.template.title")}</legend>
            {TEMPLATES.map((item) => <label key={item.id} className="cvs-tpl">
              <input type="radio" name="template" value={item.id} checked={template === item.id} onChange={() => setPicked(item.id)} />
              <span className={`cvs-thumb cvs-thumb--${item.id}`} aria-hidden="true"><i className="h" /><i /><i /><i style={{ width: "80%" }} /><i /><i style={{ width: "70%" }} /></span>
              <span><b>{t(item.label)}</b><br /><span className="ui-small ui-muted">{t(`cvs.template.about.${item.id}`)}</span>
                {current.defaultTemplate === item.id && <><br /><span className="ui-pill cvs-default">{t("cvs.template.default")}</span></>}</span>
            </label>)}
            <p className="ui-coach ui-coach--sm">{t("cvs.template.safe")}</p>
            {current.kind === "tailored"
              ? <Checkbox label={t("cvs.template.makeDefault")} checked={asDefault} onChange={(event) => setAsDefault(event.target.checked)} />
              : <p className="ui-small ui-muted">{t("cvs.template.baseNote")}</p>}
          </fieldset>
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
