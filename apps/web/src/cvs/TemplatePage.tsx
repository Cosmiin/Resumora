import { Link, Navigate, useLocation, useParams } from "react-router";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { Skeleton } from "../ui/index.ts";
import { jobName, type CvDoc } from "./useCvDoc.ts";
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
  // The way back: a tailored CV's pages sit under its job, the base CV's under My CV.
  const { id: jobId } = useParams();
  return <AppShell><main className="ui-page cvs-page"><div className="ui-wrap ui-main">
    {state === "loading" ? <div className="ui-stack" aria-busy="true"><p role="status" className="ui-sr">{t("cvs.loading")}</p>
      <Skeleton width="40%" height="40px" /><Skeleton height="220px" /></div>
      : <div className="ui-stack"><p role="alert" className="ui-notice ui-notice--bad">{t(state === "error" ? "cvs.loadError" : "tailored.none")}</p>
        <p className="ui-row">{state === "error" && <button type="button" className="ui-btn" onClick={onRetry}>{t("tailor.retry")}</button>}
          {jobId ? <Link className="ui-btn ui-btn--quiet" to={`/jobs/${encodeURIComponent(jobId)}`}>{t("cvs.toJob")}</Link>
            : <Link className="ui-btn ui-btn--quiet" to="/cv">{t("cvs.toBase")}</Link>}</p></div>}
  </div></main></AppShell>;
}

/** The old `/cv/template` and `/jobs/:id/cv/template`: the template is chosen on the download page now. */
export function TemplatePage() {
  const { pathname, search } = useLocation();
  return <Navigate replace to={pathname.replace(/\/template$/, "/export") + search} />;
}
