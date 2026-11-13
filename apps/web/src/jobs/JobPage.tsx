import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { Job, JobListPage, MatchScore } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { ApiClientError } from "../lib/api.ts";
import { useT } from "../i18n/t.ts";
import { getLanguage } from "../i18n/language.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Skeleton } from "../ui/Page.tsx";
import { deleteJob, getJob, getJobScore, patchJob, scoreJob } from "./jobs-api.ts";
import { JobSummary } from "./JobSummary.tsx";
import { JobEditForm } from "./JobEditForm.tsx";
import { Keywords, MatchNumber, MustHaves, NiceToHave, mustCount } from "./JobMatch.tsx";
import { JobScoreHow } from "./JobScoreCard.tsx";
import { TailorGate } from "./TailorGate.tsx";
import { TailoredJobView } from "./TailoredJobView.tsx";
import { fetchOpenRun } from "../tailor/open-run.ts";

export function JobPage() {
  const userId = useAuth().session?.user.id ?? "anonymous";
  const { id = "" } = useParams();
  return <JobView key={`${userId}:${id}`} id={id} userId={userId} />;
}

function JobView({ id, userId }: { id: string; userId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pollUntil] = useState(() => Date.now() + 120_000);
  const [pollStopped, setPollStopped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tailorGate, setTailorGate] = useState(false);
  const [tailorReason, setTailorReason] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["job", userId, id], queryFn: () => getJob(id), gcTime: 0,
    refetchInterval: (q) => !pollStopped && Date.now() < pollUntil
      && (q.state.data?.status === "queued" || q.state.data?.status === "processing") ? 3000 : false,
  });
  // ?cv= names the tailored CV the score is about; without it the API answers for the one saved last.
  const cv = useSearchParams()[0].get("cv");
  const scoreKey = ["job-score", userId, id, cv];
  // Choosing another language copy changes the key; the previous answer stays on screen until the new one arrives.
  const score = useQuery({
    queryKey: scoreKey, queryFn: () => (cv ? getJobScore(id, cv) : getJobScore(id)), gcTime: 0,
    enabled: query.data?.status === "ready", placeholderData: keepPreviousData,
  });
  // An unfinished tailoring run this browser remembers (the flow forgets it when the run is done).
  const openRun = useQuery({ queryKey: ["job-tailor-run", userId, id], gcTime: 0, queryFn: () => fetchOpenRun(id) });
  const [scoring, setScoring] = useState<"idle" | "busy" | "failed">("idle");
  /** Try again: a ready job with no Score 1 (saved before scoring, or scoring failed once) gets one computed now. */
  async function retryScore() {
    if (!score.isSuccess || score.data.base) { void score.refetch(); return; }
    setScoring("busy");
    try {
      queryClient.setQueryData(scoreKey, await scoreJob(id));
      setScoring("idle");
    } catch {
      setScoring("failed");
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => setPollStopped(true), Math.max(0, pollUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [pollUntil]);

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteJob(id);
      await queryClient.cancelQueries({ queryKey: ["jobs", userId], exact: true });
      queryClient.setQueryData<InfiniteData<JobListPage>>(["jobs", userId], (data) => data && ({
        ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((job) => job.id !== id) })),
      }));
      void navigate("/jobs");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t("jobs.error.generic"));
      setDeleting(false);
    }
  }
  async function cacheJob(updated: Job) {
    await queryClient.cancelQueries({ queryKey: ["jobs", userId], exact: true });
    await queryClient.cancelQueries({ queryKey: ["job", userId, id], exact: true });
    queryClient.setQueryData(["job", userId, id], updated);
    queryClient.setQueryData<InfiniteData<JobListPage>>(["jobs", userId], (data) => data && ({
      ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((row) => row.id === id
        ? { ...row, title: updated.title, company: updated.company, location: updated.location } : row) })),
    }));
  }
  async function saved(updated: Job) {
    await cacheJob(updated);
    setEditing(false);
  }
  async function changeStatus(applicationStatus: Job["applicationStatus"]) {
    setStatusSaving(true);
    setStatusError(null);
    try {
      const current = queryClient.getQueryData<Job>(["job", userId, id]);
      if (!current?.extracted) throw new Error(t("jobs.error.wrong_status"));
      const updated = await patchJob(id, current.version, current.extracted, { applicationStatus });
      await cacheJob(updated);
    }
    catch (cause) { setStatusError(t(cause instanceof ApiClientError && cause.code === "version_conflict"
      ? "jobs.error.version_conflict" : "jobs.error.generic")); }
    finally { setStatusSaving(false); }
  }
  const job = query.data;
  const extracted = job?.extracted;
  const busy = job?.status === "queued" || job?.status === "processing";
  const dates = getLanguage() === "ro" ? "ro-RO" : "en-GB";
  const original = job && <a className="ui-small" href={job.url} target="_blank" rel="noopener noreferrer">{t("job.original")}</a>;
  const removeButton = <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setConfirmDelete(true)}>{t("job.delete")}</button>;
  const jobPath = `/jobs/${encodeURIComponent(id)}`;
  const run = openRun.data;
  const tailored = score.data?.tailored;
  const runStep = run ? t("job.tailor.step", { n: run.sections.indexOf(run.currentSection!) + 1, total: run.sections.length,
    section: t(`tailor.section.${run.currentSection!}`) }) : null;
  // The one main action of the page: continue a run, open the tailored CV, or start tailoring.
  const tailor = !job ? null : run ? (
    <div className="job-tailor">
      <Link className="ui-btn ui-btn--primary" to={`${jobPath}/tailor`}>{t("job.tailor.continue")}</Link>
      <p className="ui-small ui-muted">{runStep}</p>
    </div>
  ) : tailored ? (
    <div className="job-tailor">
      <div className="ui-row">
        <Link className="ui-btn ui-btn--primary" to={`${jobPath}/cv`}>{t("job.tailor.open")}</Link>
        <Link className="ui-btn" to={`${jobPath}/cv?retailor=1`}>{t("job.tailor.again")}</Link>
      </div>
      {tailored.total !== null && <p className="ui-small ui-muted">{t("job.tailor.lift", { base: score.data?.base?.total ?? "–", latest: tailored.total })}</p>}
    </div>
  ) : (
    <div className="job-tailor">
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => {
        if (job.status !== "ready") {
          setTailorReason(t(job.status === "failed" ? "job.tailor.failed"
            : job.status === "needs_text" ? "job.tailor.needsText" : "job.tailor.notReady"));
        } else { setTailorReason(null); setTailorGate(true); }
      }}>{t("job.tailor.button")}</button>
      {tailorReason && <p role="status" className="ui-small">{tailorReason}</p>}
    </div>
  );
  const applyByText = extracted?.applyBy
    ? new Date(`${extracted.applyBy}T00:00:00Z`).toLocaleDateString(dates, {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }) : null;
  const salary = extracted?.salary;
  const salaryText = salary && (salary.min !== null || salary.max !== null)
    ? [salary.min, salary.max].filter((value) => value !== null).map((value) => value.toLocaleString("en")).join("–")
      + (salary.currency ? ` ${salary.currency}` : "") + (salary.period ? ` / ${t(`job.period.${salary.period}`)}` : "") : null;
  const base = score.data?.base ?? null;
  const musts = extracted ? mustCount(extracted.requirements, base) : null;
  // A job is tailored once a tailoring run is done; only then the page turns into the tailored CV's page.
  const isTailored = score.data?.hasTailoredCv === true;
  const statusSelect = job && (
    <label className="job-application-status"><span className="ui-label">{t("job.status.title")}</span>
      <select className="ui-input" value={job.applicationStatus} disabled={statusSaving}
        onChange={(event) => void changeStatus(event.target.value as Job["applicationStatus"])}>
        {(["saved", "applied", "interview", "offer", "rejected"] as const).map((status) =>
          <option value={status} key={status}>{t(`job.status.${status}`)}</option>)}
      </select>
    </label>
  );
  const statusAlert = statusError && <p role="alert" className="ui-notice ui-notice--bad">{statusError}</p>;
  /** The must-haves, marked from the given score. */
  const mustHaves = (marks: MatchScore | null) => extracted && (
    <MustHaves requirements={extracted.requirements} score={marks}
      state={<div className="ui-row"><p className="ui-small ui-muted">{t(score.isPending || scoring === "busy" ? "job.score.checking"
        : score.isError ? "job.score.loadError" : scoring === "failed" ? "job.score.computeError" : "job.score.pending")}</p>
        {!score.isPending && <button type="button" className="ui-btn ui-btn--sm" disabled={scoring === "busy"} onClick={() => void retryScore()}>{t("jobs.retry")}</button>}</div>}>
      <NiceToHave inside requirements={extracted.requirements} score={marks} />
    </MustHaves>
  );
  /** About this job, its keywords marked from the given score. The tailored page has the application status in its header. */
  const about = (marks: MatchScore | null) => job && extracted && (
    <section className="job-more ui-stack">
      <h2 className="ui-heading">{t("job.more.title")}</h2>
      {extracted.summary.trim() && <div className="sec"><h3>{t("job.inShort")}</h3><p>{extracted.summary}</p></div>}
      <JobSummary extracted={extracted} rawText={job.rawText} salaryStated={salaryText !== null}
        keywords={<Keywords inside score={marks} terms={extracted.keywords} />} />
      {!isTailored && statusSelect}
      {!isTailored && statusAlert}
      <div className="ui-row">
        <button type="button" className="ui-btn" disabled={statusSaving} onClick={() => setEditing(true)}>{t("job.edit")}</button>
        {removeButton}
      </div>
      <p className="ui-small ui-muted">{t(job.editedByUser ? "job.editedByYou" : "job.readByAi")}</p>
    </section>
  );

  return <AppShell>
    <main className="ui-page jobs-page job-page">
      <div className="ui-wrap ui-main">
      <p className="ui-small job-crumb"><Link to="/jobs">{t("job.back")}</Link></p>
      {query.isPending ? (
        <div className="ui-sheet ui-stack jobs-narrow" aria-busy="true">
          <span className="ui-sr" role="status">{t("app.loading")}</span>
          <Skeleton width="60%" height="28px" /><Skeleton /><Skeleton width="80%" />
        </div>
      ) : query.isError && query.data === undefined ? (
        query.error instanceof ApiClientError && query.error.status === 404 ? <p className="ui-notice jobs-narrow">{t("job.notFound")}</p> :
          <div className="ui-stack jobs-narrow"><p role="alert" className="ui-notice ui-notice--bad">{t("jobs.loadError")}</p>
            <div className="ui-row"><button type="button" className="ui-btn" onClick={() => void query.refetch()}>{t("jobs.retry")}</button></div></div>
      ) : busy ? <div className="ui-stack jobs-narrow" aria-busy="true">
        <h1 className="ui-title">{t("job.reading.title")}</h1>
        <p className="ui-lead" role="status">{t("job.reading.text")}</p>
        <div className="ui-sheet ui-stack"><Skeleton width="60%" height="28px" /><Skeleton /><Skeleton width="80%" /></div>
        {pollStopped && <p className="ui-notice" role="status">{t("jobs.stillReading")}</p>}
        <div className="ui-row">{original}</div>
      </div> : job?.status === "failed" ? <div className="ui-stack jobs-narrow">
        <h1 className="ui-title">{t(job.errorCode === "not_a_job" ? "jobs.error.not_a_job" : "jobs.error.ai_failed")}</h1>
        <p className="ui-notice ui-notice--bad" role="alert">{t(job.errorCode === "not_a_job" ? "job.failed.notAJob" : "job.failed.other")}</p>
        <div className="ui-row">{removeButton}{original}</div>
      </div> : extracted && editing ? <div className="ui-sheet"><JobEditForm id={id} version={job.version} extracted={extracted}
        onSaved={saved} onCancel={() => setEditing(false)} onReload={async () => {
          const result = await query.refetch();
          if (result.isError) throw result.error;
          setEditing(false);
        }} /></div> : extracted ? <>
        <div className="jobs-head">
          <div>
            <h1 className="ui-title">{job.title}</h1>
            <p className="ui-muted job-place">{[job.company, job.location].filter(Boolean).join(", ")}</p>
            <div className="ui-row job-facts">
              {extracted.workMode !== "unknown" && <span className="ui-pill">{t(`job.workMode.${extracted.workMode}`)}</span>}
              {extracted.employmentType !== "unknown" && <span className="ui-pill">{t(`job.type.${extracted.employmentType}`)}</span>}
              {extracted.seniority !== "unknown" && <span className="ui-pill">{t(`job.seniority.${extracted.seniority}`)}</span>}
              {salaryText !== null && <span className="ui-pill">{salaryText}</span>}
              {applyByText && <span className="ui-pill">{t("job.applyBy", { date: applyByText })}</span>}
              {isTailored && <span className="ui-pill ui-pill--good">{t("jobs.pill.tailored")}</span>}
              {original}
            </div>
          </div>
          {isTailored && statusSelect}
        </div>
        {isTailored && statusAlert}
        {extracted.positionClosed === true && <p role="status" className="ui-notice job-closed">{t("job.positionClosed")}</p>}
        {score.isLoading ? (
          // The first score answer decides which page this is (the tailored CV's, or the job's own), so nothing of
          // either shows before it arrives. A language switch keeps the previous answer and never gets here.
          <div className="ui-sheet ui-stack" aria-busy="true">
            <span className="ui-sr" role="status">{t("app.loading")}</span>
            <Skeleton width="60%" height="28px" /><Skeleton /><Skeleton width="80%" />
          </div>
        ) : isTailored && score.data ? (
          <TailoredJobView jobPath={jobPath} requirements={extracted.requirements} score={score.data} runStep={runStep}
            // A Re-check answers for the copy on screen when it started. While another copy's score is still loading,
            // that is not the copy this address names, so the answer isn't kept under it (the server has saved it).
            onScore={(next) => { if (!score.isPlaceholderData) queryClient.setQueryData(scoreKey, next); }}
            details={<><div className="ui-stack">{mustHaves(score.data.tailored)}</div>{about(score.data.tailored)}</>} />
        ) : <>
        {/* The answer first: the match, what the coach says about it, and the page's one main action. */}
        <section className="job-band" aria-label={t("job.band.label")}>
          {base && <MatchNumber score={base} />}
          {((musts && musts.total > 0 && !tailored && !run) || (base && base.total !== null)) && (
            <div className="job-band-say">
              {musts && musts.total > 0 && !tailored && !run && (
                <p className="ui-coach job-coach">{t(musts.met === musts.total ? "job.coach.all" : musts.met === 0 ? "job.coach.none" : "job.coach.some", { n: musts.met, total: musts.total })}</p>
              )}
              {base && base.total !== null && <JobScoreHow score={base} />}
            </div>
          )}
          {tailor}
        </section>
        <div className="job-cols">
          <div className="ui-stack">{mustHaves(base)}</div>
          {about(base)}
        </div>
        </>}
      </> : job?.status === "needs_text" ? <div className="ui-stack jobs-narrow">
        <p className="ui-notice">{t("job.tailor.needsText")}</p><div className="ui-row">{removeButton}{original}</div>
      </div> : null}
      {tailorGate && <TailorGate onTailor={() => void navigate(`/jobs/${encodeURIComponent(id)}/tailor`)}
        onEnrich={() => void navigate("/cv?enrich=1")} onClose={() => setTailorGate(false)} />}
      <Dialog open={confirmDelete} onClose={() => { if (!deleting) { setConfirmDelete(false); setDeleteError(null); } }} title={t("job.deleteConfirm")}
        actions={<>
          <button type="button" className="ui-btn ui-btn--quiet" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteError(null); }}>{t("job.deleteCancel")}</button>
          <button type="button" className="ui-btn ui-btn--danger" disabled={deleting} onClick={() => void remove()}>{t("job.delete")}</button>
        </>}>
        {query.data?.status === "ready" && (!score.isSuccess || score.data.tailored != null) && <p>{t("job.deleteTailored")}</p>}
        {deleteError && <p role="alert" className="ui-notice ui-notice--bad">{deleteError}</p>}
      </Dialog>
      </div>
    </main>
  </AppShell>;
}
