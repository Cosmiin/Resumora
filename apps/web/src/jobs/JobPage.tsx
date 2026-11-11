import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import type { Job, JobListPage } from "@resumora/shared";
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
import { getRun } from "../tailor/tailor-api.ts";
import { remembered } from "../tailor/TailorFlow.tsx";

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
  const score = useQuery({
    queryKey: ["job-score", userId, id], queryFn: () => getJobScore(id), gcTime: 0,
    enabled: query.data?.status === "ready",
  });
  // An unfinished tailoring run this browser remembers (the flow forgets it when the run is done).
  const openRun = useQuery({
    queryKey: ["job-tailor-run", userId, id], gcTime: 0,
    queryFn: async () => {
      const stored = remembered(id);
      const run = stored ? await getRun(stored).catch(() => null) : null;
      return run && run.status !== "done" && run.currentSection ? run : null;
    },
  });
  const [scoring, setScoring] = useState<"idle" | "busy" | "failed">("idle");
  /** Try again: a ready job with no Score 1 (saved before scoring, or scoring failed once) gets one computed now. */
  async function retryScore() {
    if (!score.isSuccess || score.data.base) { void score.refetch(); return; }
    setScoring("busy");
    try {
      queryClient.setQueryData(["job-score", userId, id], await scoreJob(id));
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
  // The one main action of the page: continue a run, open the tailored CV, or start tailoring.
  const tailor = !job ? null : run ? (
    <div className="job-tailor">
      <Link className="ui-btn ui-btn--primary" to={`${jobPath}/tailor`}>{t("job.tailor.continue")}</Link>
      <p className="ui-small ui-muted">{t("job.tailor.step", { n: run.sections.indexOf(run.currentSection!) + 1, total: run.sections.length,
        section: t(`tailor.section.${run.currentSection!}`) })}</p>
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
              {original}
            </div>
          </div>
        </div>
        {extracted.positionClosed === true && <p role="status" className="ui-notice job-closed">{t("job.positionClosed")}</p>}
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
          <div className="ui-stack">
          <MustHaves requirements={extracted.requirements} score={base}
            state={<div className="ui-row"><p className="ui-small ui-muted">{t(score.isPending || scoring === "busy" ? "job.score.checking"
              : score.isError ? "job.score.loadError" : scoring === "failed" ? "job.score.computeError" : "job.score.pending")}</p>
              {!score.isPending && <button type="button" className="ui-btn ui-btn--sm" disabled={scoring === "busy"} onClick={() => void retryScore()}>{t("jobs.retry")}</button>}</div>}>
            <NiceToHave inside requirements={extracted.requirements} score={base} />
          </MustHaves>
          <Keywords score={base} />
          </div>
        <section className="job-more ui-stack">
          <h2 className="ui-heading">{t("job.more.title")}</h2>
          {extracted.summary.trim() && <div className="sec"><h3>{t("job.inShort")}</h3><p>{extracted.summary}</p></div>}
          <JobSummary extracted={extracted} rawText={job.rawText} salaryStated={salaryText !== null} />
          <label className="job-application-status"><span className="ui-label">{t("job.status.title")}</span>
            <select className="ui-input" value={job.applicationStatus} disabled={statusSaving}
              onChange={(event) => void changeStatus(event.target.value as Job["applicationStatus"])}>
              {(["saved", "tailored", "applied", "interview", "offer", "rejected"] as const).map((status) =>
                <option value={status} key={status}>{t(`job.status.${status}`)}</option>)}
            </select>
          </label>
          {statusError && <p role="alert" className="ui-notice ui-notice--bad">{statusError}</p>}
          <div className="ui-row">
            <button type="button" className="ui-btn" disabled={statusSaving} onClick={() => setEditing(true)}>{t("job.edit")}</button>
            {removeButton}
          </div>
          <p className="ui-small ui-muted">{t(job.editedByUser ? "job.editedByYou" : "job.readByAi")}</p>
        </section>
        </div>
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
