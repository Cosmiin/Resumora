import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import type { Job, JobListPage, JobPatch } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";
import { deleteJob, getJob, getJobScore, patchJob, scoreJob } from "./jobs-api.ts";
import { JobAd } from "./JobAd.tsx";
import { JobSummary } from "./JobSummary.tsx";
import { JobEditForm } from "./JobEditForm.tsx";
import { JobScoreCard } from "./JobScoreCard.tsx";
import { JobThoughts } from "./JobThoughts.tsx";
import { TailorGate } from "./TailorGate.tsx";

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
  const [tab, setTab] = useState<"ad" | "summary">("ad");
  const [editing, setEditing] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tailorGate, setTailorGate] = useState(false);
  const [tailorReason, setTailorReason] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [thoughtsBusy, setThoughtsBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const detailsSave = useRef<Promise<unknown>>(Promise.resolve());
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
    setTab("summary");
  }
  function saveDetails(changes: Pick<JobPatch, "userThoughts" | "applicationStatus">): Promise<Job> {
    setPendingSaves((count) => count + 1);
    const pending = detailsSave.current.catch(() => undefined).then(async () => {
      const current = queryClient.getQueryData<Job>(["job", userId, id]);
      if (!current?.extracted) throw new Error(t("jobs.error.wrong_status"));
      const updated = await patchJob(id, current.version, current.extracted, changes);
      await cacheJob(updated);
      return updated;
    }).finally(() => setPendingSaves((count) => count - 1));
    detailsSave.current = pending;
    return pending;
  }
  async function changeStatus(applicationStatus: Job["applicationStatus"]) {
    setStatusSaving(true);
    setStatusError(null);
    try { await saveDetails({ applicationStatus }); }
    catch (cause) { setStatusError(t(cause instanceof ApiClientError && cause.code === "version_conflict"
      ? "jobs.error.version_conflict" : "jobs.error.generic")); }
    finally { setStatusSaving(false); }
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + 2) % 2;
    setTab(next === 0 ? "ad" : "summary");
    tabRefs.current[next]?.focus();
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
  const tailor = job && !editing && <div className="tailor">
    <div><strong>{t("job.tailor.title")}</strong><span>{t("job.tailor.text")}</span>
      {tailorReason && <p role="status" className="jobs-note">{tailorReason}</p>}</div>
    <button type="button" onClick={() => {
      if (job.status !== "ready") {
        setTailorReason(t(job.status === "failed" ? "job.tailor.failed"
          : job.status === "needs_text" ? "job.tailor.needsText" : "job.tailor.notReady"));
      } else { setTailorReason(null); setTailorGate(true); }
    }}>{t("job.tailor.button")}</button>
  </div>;
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
          <div className="job-actions"><button type="button" className="secondary" disabled={pendingSaves > 0 || thoughtsBusy} onClick={() => setEditing(true)}>{t("job.edit")}</button>{deletion}</div>
        </div>
        <div className="facts">
          {extracted.workMode !== "unknown" && <span className="fact">{t(`job.workMode.${extracted.workMode}`)}</span>}
          {extracted.employmentType !== "unknown" && <span className="fact">{t(`job.type.${extracted.employmentType}`)}</span>}
          {extracted.seniority !== "unknown" && <span className="fact">{t(`job.seniority.${extracted.seniority}`)}</span>}
          {salaryText !== null && <span className="fact">{salaryText}</span>}
          {applyByText && <span className="fact">{t("job.applyBy", { date: applyByText })}</span>}
        </div>
        <div className="job-detail-columns">
          <aside className="job-match-column">
            {score.data?.base ? <JobScoreCard score={score.data.base} requirements={extracted.requirements} />
              : <div className="job-score"><p className="jobs-note">{t(score.isPending || scoring === "busy" ? "app.loading"
                : score.isError ? "job.score.loadError" : scoring === "failed" ? "job.score.computeError" : "job.score.pending")}</p>
                <button type="button" className="secondary" disabled={scoring === "busy"} onClick={() => void retryScore()}>{t("jobs.retry")}</button></div>}
          </aside>
          <div className="job-detail-main">
            <label className="job-application-status">{t("job.status.title")}
              <select value={job.applicationStatus} disabled={statusSaving}
                onChange={(event) => void changeStatus(event.target.value as Job["applicationStatus"])}>
                {(["saved", "tailored", "applied", "interview", "offer", "rejected"] as const).map((status) =>
                  <option value={status} key={status}>{t(`job.status.${status}`)}</option>)}
              </select>
            </label>
            {statusError && <p role="alert" className="jobs-field-error">{statusError}</p>}
            <JobThoughts value={job.userThoughts} onBusyChange={setThoughtsBusy} onSave={(userThoughts) => saveDetails({ userThoughts })} />
            <div className="tabs" role="tablist" aria-label={t("job.tabs")}>
              {(["ad", "summary"] as const).map((value, index) => <button type="button" role="tab" key={value}
                id={`job-tab-${value}`} aria-controls="job-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
                ref={(element) => { tabRefs.current[index] = element; }} onClick={() => setTab(value)} onKeyDown={(event) => moveTab(event, index)}>
                {t(value === "ad" ? "job.tab.ad" : "job.tab.summary")}
              </button>)}
            </div>
            <div className="job-panel" role="tabpanel" id="job-panel" aria-labelledby={`job-tab-${tab}`} tabIndex={0}>
              {tab === "ad" ? <JobAd rawText={job.rawText} requirements={extracted.requirements} /> : <JobSummary extracted={extracted} />}
            </div>
          </div>
        </div>
        {tailor}
        <footer className="foot">{original}<span>{t(job.editedByUser ? "job.editedByYou" : "job.readByAi")}</span></footer>
      </> : job?.status === "needs_text" ? <div className="waiting">
        <p>{t("job.tailor.needsText")}</p>{original}{deletion}{tailor}
      </div> : null}
      {tailorGate && <TailorGate onTailor={() => void navigate(`/jobs/${encodeURIComponent(id)}/tailor`)}
        onEnrich={() => void navigate("/cv")} onClose={() => setTailorGate(false)} />}
      {deleteError && <p role="alert" className="jobs-field-error">{deleteError}</p>}
    </main>
  </AppShell>;
}
