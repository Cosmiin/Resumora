import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { JobExtraction, JobScore } from "@resumora/shared";
import { CvDocument } from "../cv/page/CvDocument.tsx";
import { getTemplate } from "../cv/page/templates.ts";
import { useCvDoc } from "../cvs/useCvDoc.ts";
import { useT } from "../i18n/t.ts";
import { Skeleton } from "../ui/Page.tsx";
import { MatchNumber, mustCount, openMusts } from "./JobMatch.tsx";
import "../styles/cvs.css";

/**
 * A tailored job's page under its header: the tailored CV's latest score with the CV's actions, the job
 * itself folded into one row, then the tailored CV, read-only.
 */
export function TailoredJobView({ jobPath, requirements, score, details }: {
  jobPath: string;
  requirements: JobExtraction["requirements"];
  /** The score answer for the copy on screen (`tailoredCvId`). */
  score: JobScore;
  /** The must-haves and About this job, shown while the job row is open. */
  details: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const cvId = score.tailoredCvId ?? undefined;
  const { doc } = useCvDoc(cvId);
  const tailored = score.tailored;
  const musts = mustCount(requirements, tailored);
  const stillOpen = openMusts(requirements, tailored);
  // The loaded CV's own links; the same addresses before it has loaded, so the buttons always work.
  const page = `${jobPath}/cv`;
  const query = cvId ? `?cv=${encodeURIComponent(cvId)}` : "";
  const links = doc.data?.links ?? { open: page + query, template: `${page}/template${query}`, export: `${page}/export${query}` };

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
      </div>
      {musts && musts.total > 0 && (
        <p className="ui-coach job-coach">{musts.met === musts.total ? t("job.tailored.coach.all", { total: musts.total })
          : t("job.tailored.coach.some", { met: musts.met, total: musts.total, open: stillOpen.slice(0, 2).join(", ")
            + (stillOpen.length > 2 ? t("job.tailored.coach.more", { n: stillOpen.length - 2 }) : "") })}</p>
      )}
      <div className="job-tailor">
        <Link className="ui-btn ui-btn--primary" to={links.open}>{t("job.tailored.edit")}</Link>
        <div className="ui-row">
          <Link className="ui-btn" to={links.export}>{t("job.tailored.export")}</Link>
          <Link className="ui-btn" to={`${links.open}${links.open.includes("?") ? "&" : "?"}retailor=1`}>{t("job.tailor.again")}</Link>
        </div>
      </div>
    </section>

    <button type="button" className="job-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{t("job.tailored.fold")}</span><span>{t(open ? "job.tailored.hide" : "job.tailored.show")}</span>
    </button>
    {open && <div className="job-cols job-fold-body">{details}</div>}

    <div className="job-cvbar">
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
