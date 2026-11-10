import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import type { Job, JobListPage } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";
import { deleteJob, getJob, getJobScore, patchJob, scoreJob } from "./jobs-api.ts";
import { JobSummary } from "./JobSummary.tsx";
import { JobEditForm } from "./JobEditForm.tsx";
import { RequirementList } from "./RequirementList.tsx";
import { TailorGate } from "./TailorGate.tsx";
import { getRun } from "../tailor/tailor-api.ts";
import { remembered } from "../tailor/TailorFlow.tsx";

export function JobPage() {
  const userId = useAuth().session?.user.id ?? "anonymous";
  const { id = "" } = useParams();
  return <JobView key={`${userId}:${id}`} id={id} userId={userId} />;
}

function JobView({ id, userId }: { id: string; userId: string }) {
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
  const original = job && <a href={job.url} target="_blank" rel="noopener noreferrer">{t("job.original")}</a>;
  const deletion = <div className="job-delete">
    {confirmDelete ? <div role="dialog" aria-label={t("job.deleteConfirm")}>
      <p className="jobs-note">{t("job.deleteConfirm")}</p>
      {query.data?.status === "ready" && (!score.isSuccess || score.data.tailored != null) && <p className="jobs-note">{t("job.deleteTailored")}</p>}
      <button type="button" className="secondary danger" disabled={deleting} onClick={() => void remove()}>{t("job.delete")}</button>
      <button type="button" className="secondary" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteError(null); }}>{t("job.deleteCancel")}</button>
    </div> : <button type="button" className="secondary danger" onClick={() => setConfirmDelete(true)}>{t("job.delete")}</button>}
  </div>;
  const jobPath = `/jobs/${encodeURIComponent(id)}`;
  const run = openRun.data;
  const tailored = score.data?.tailored;
  const tailor = !job || editing ? null : run ? <div className="tailor">
    <div><strong>{t("job.tailor.inProgress")}</strong>
      <span>{t("job.tailor.step", { n: run.sections.indexOf(run.currentSection!) + 1, total: run.sections.length,
        section: t(`tailor.section.${run.currentSection!}`) })}</span></div>
    <Link className="tailor-link" to={`${jobPath}/tailor`}>{t("job.tailor.continue")}</Link>
  </div> : tailored ? <div className="tailor">
    <div><strong>{t("job.tailor.ready")}</strong>
      {tailored.total !== null && <span>{t("job.tailor.lift", { base: score.data?.base?.total ?? "—", latest: tailored.total })}</span>}</div>
    <div className="tailor-links">
      <Link className="tailor-link" to={`${jobPath}/cv`}>{t("job.tailor.open")}</Link>
      <Link className="tailor-link secondary" to={`${jobPath}/cv?retailor=1`}>{t("job.tailor.again")}</Link>
    </div>
  </div> : <div className="tailor">
    <div><strong>{t("job.tailor.title")}</strong><span>{t("job.tailor.text")}</span>
      {tailorReason && <p role="status" className="jobs-note">{tailorReason}</p>}</div>
    <button type="button" onClick={() => {
      if (job.status !== "ready") {
        setTailorReason(t(job.status === "failed" ? "job.tailor.failed"
          : job.status === "needs_text" ? "job.tailor.needsText" : "job.tailor.notReady"));
      } else { setTailorReason(null); setTailorGate(true); }
    }}>{t("job.tailor.button")}</button>
  </div>;
  // A tailored CV (or a run to continue) is shown at the top of the job page; the Tailor button stays below the ad.
  const tailorOnTop = !!(run || tailored);
  const applyByText = extracted?.applyBy
    ? new Date(`${extracted.applyBy}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }) : null;
  const salary = extracted?.salary;
  const salaryText = salary && (salary.min !== null || salary.max !== null)
    ? [salary.min, salary.max].filter((value) => value !== null).map((value) => value.toLocaleString("en")).join("–")
      + (salary.currency ? ` ${salary.currency}` : "") + (salary.period ? ` / ${t(`job.period.${salary.period}`)}` : "") : null;

  return <AppShell>
    <main className="jobs-page job-page">
      <Link className="crumb" to="/jobs">{t("job.back")}</Link>
      {query.isPending ? <p>{t("app.loading")}</p> : query.isError && query.data === undefined ? (
        query.error instanceof ApiClientError && query.error.status === 404 ? <p>{t("job.notFound")}</p> :
          <div className="jobs-state"><p role="alert">{t("jobs.loadError")}</p>
            <button type="button" onClick={() => void query.refetch()}>{t("jobs.retry")}</button></div>
      ) : busy ? <div className="waiting">
        <span className="job-badge">{t("jobs.badge.reading")}</span>
        <h1 className="vtitle">{t("job.reading.title")}</h1>
        <p className="jobs-note">{t("job.reading.text")}</p>
        {pollStopped && <p className="jobs-note" role="status">{t("jobs.stillReading")}</p>}
        {original}{tailor}
      </div> : job?.status === "failed" ? <div className="waiting">
        <span className="job-badge job-badge-failed">{t("jobs.badge.failed")}</span>
        <h1 className="vtitle">{t(job.errorCode === "not_a_job" ? "jobs.error.not_a_job" : "jobs.error.ai_failed")}</h1>
        <p className="jobs-note">{t(job.errorCode === "not_a_job" ? "job.failed.notAJob" : "job.failed.other")}</p>
        {original}{deletion}{tailor}
      </div> : extracted && editing ? <JobEditForm id={id} version={job.version} extracted={extracted}
        onSaved={saved} onCancel={() => setEditing(false)} onReload={async () => {
          const result = await query.refetch();
          if (result.isError) throw result.error;
          setEditing(false);
        }} /> : extracted ? <>
        <div className="view-head">
          <div><h1 className="vtitle">{job.title}</h1><div className="vsub">{[job.company, job.location].filter(Boolean).join(" · ")}</div></div>
          <div className="job-actions"><button type="button" className="secondary" disabled={statusSaving} onClick={() => setEditing(true)}>{t("job.edit")}</button>{deletion}</div>
        </div>
        {extracted.positionClosed === true && <p role="status" className="jobs-note">{t("job.positionClosed")}</p>}
        {tailorOnTop && tailor}
        <div className="facts">
          {extracted.workMode !== "unknown" && <span className="fact">{t(`job.workMode.${extracted.workMode}`)}</span>}
          {extracted.employmentType !== "unknown" && <span className="fact">{t(`job.type.${extracted.employmentType}`)}</span>}
          {extracted.seniority !== "unknown" && <span className="fact">{t(`job.seniority.${extracted.seniority}`)}</span>}
          {salaryText !== null && <span className="fact">{salaryText}</span>}
          {applyByText && <span className="fact">{t("job.applyBy", { date: applyByText })}</span>}
        </div>
        {extracted.summary.trim() && <section className="sec"><h2>{t("job.inShort")}</h2><p>{extracted.summary}</p></section>}
        <RequirementList requirements={extracted.requirements} score={score.data?.base ?? null}
          state={<div className="job-score"><p className="jobs-note">{t(score.isPending || scoring === "busy" ? "app.loading"
            : score.isError ? "job.score.loadError" : scoring === "failed" ? "job.score.computeError" : "job.score.pending")}</p>
            <button type="button" className="secondary" disabled={scoring === "busy"} onClick={() => void retryScore()}>{t("jobs.retry")}</button></div>} />
        <JobSummary extracted={extracted} rawText={job.rawText} salaryStated={salaryText !== null} />
        <label className="job-application-status">{t("job.status.title")}
          <select value={job.applicationStatus} disabled={statusSaving}
            onChange={(event) => void changeStatus(event.target.value as Job["applicationStatus"])}>
            {(["saved", "tailored", "applied", "interview", "offer", "rejected"] as const).map((status) =>
              <option value={status} key={status}>{t(`job.status.${status}`)}</option>)}
          </select>
        </label>
        {statusError && <p role="alert" className="jobs-field-error">{statusError}</p>}
        {!tailorOnTop && tailor}
        <footer className="foot">{original}<span>{t(job.editedByUser ? "job.editedByYou" : "job.readByAi")}</span></footer>
      </> : job?.status === "needs_text" ? <div className="waiting">
        <p>{t("job.tailor.needsText")}</p>{original}{deletion}{tailor}
      </div> : null}
      {tailorGate && <TailorGate onTailor={() => void navigate(`/jobs/${encodeURIComponent(id)}/tailor`)}
        onEnrich={() => void navigate("/cv?enrich=1")} onClose={() => setTailorGate(false)} />}
      {deleteError && <p role="alert" className="jobs-field-error">{deleteError}</p>}
    </main>
  </AppShell>;
}
