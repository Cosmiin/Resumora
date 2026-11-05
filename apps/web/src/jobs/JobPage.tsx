import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import type { JobListPage } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";
import { deleteJob, getJob } from "./jobs-api.ts";
import { JobAd } from "./JobAd.tsx";
import { JobSummary } from "./JobSummary.tsx";

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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["job", userId, id], queryFn: () => getJob(id), gcTime: 0,
    refetchInterval: (q) => !pollStopped && Date.now() < pollUntil
      && (q.state.data?.status === "queued" || q.state.data?.status === "processing") ? 3000 : false,
  });
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
    {confirmDelete ? <>
      <span className="jobs-note">{t("job.deleteConfirm")}</span>
      <button type="button" className="secondary danger" disabled={deleting} onClick={() => void remove()}>{t("job.delete")}</button>
      <button type="button" className="secondary" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteError(null); }}>{t("job.deleteCancel")}</button>
    </> : <button type="button" className="secondary danger" onClick={() => setConfirmDelete(true)}>{t("job.delete")}</button>}
  </div>;
  const salary = extracted?.salary;
  const salaryText = salary && (salary.min !== null || salary.max !== null)
    ? [salary.min, salary.max].filter((value) => value !== null).map((value) => value.toLocaleString("en")).join("–")
      + (salary.currency ? ` ${salary.currency}` : "") + (salary.period ? ` / ${t(`job.period.${salary.period}`)}` : "") : null;

  return <AppShell>
    <main className="jobs-page job-page">
      <Link className="crumb" to="/jobs">{t("job.back")}</Link>
      {query.isPending ? <p>{t("app.loading")}</p> : query.isError ? (
        query.error instanceof ApiClientError && query.error.status === 404 ? <p>{t("job.notFound")}</p> :
          <div className="jobs-state"><p role="alert">{t("jobs.loadError")}</p>
            <button type="button" onClick={() => void query.refetch()}>{t("jobs.retry")}</button></div>
      ) : busy ? <div className="waiting">
        <span className="job-badge">{t("jobs.badge.reading")}</span>
        <h1 className="vtitle">{t("job.reading.title")}</h1>
        <p className="jobs-note">{t("job.reading.text")}</p>
        {pollStopped && <p className="jobs-note" role="status">{t("jobs.stillReading")}</p>}
        {original}
      </div> : job?.status === "failed" ? <div className="waiting">
        <span className="job-badge job-badge-failed">{t("jobs.badge.failed")}</span>
        <h1 className="vtitle">{t(job.errorCode === "not_a_job" ? "jobs.error.not_a_job" : "jobs.error.ai_failed")}</h1>
        <p className="jobs-note">{t(job.errorCode === "not_a_job" ? "job.failed.notAJob" : "job.failed.other")}</p>
        {original}{deletion}
      </div> : extracted ? <>
        <div className="view-head">
          <div><h1 className="vtitle">{job.title}</h1><div className="vsub">{[job.company, job.location].filter(Boolean).join(" · ")}</div></div>
          <div className="job-actions"><button type="button" className="secondary">{t("job.edit")}</button>{deletion}</div>
        </div>
        <div className="facts">
          {extracted.workMode !== "unknown" && <span className="fact">{t(`job.workMode.${extracted.workMode}`)}</span>}
          {extracted.employmentType !== "unknown" && <span className="fact">{t(`job.type.${extracted.employmentType}`)}</span>}
          {extracted.seniority !== "unknown" && <span className="fact">{t(`job.seniority.${extracted.seniority}`)}</span>}
          {salaryText !== null && <span className="fact">{salaryText}</span>}
          {extracted.applyBy && <span className="fact">{t("job.applyBy", { date: extracted.applyBy })}</span>}
        </div>
        <div className="tailor">
          <div><strong>{t("job.tailor.title")} <span className="job-soon">{t("jobs.soon")}</span></strong><span>{t("job.tailor.text")}</span></div>
          <button type="button" disabled>{t("job.tailor.button")}</button>
        </div>
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
        <footer className="foot">{original}<span>{t(job.editedByUser ? "job.editedByYou" : "job.readByAi")}</span></footer>
      </> : null}
      {deleteError && <p role="alert" className="jobs-field-error">{deleteError}</p>}
    </main>
  </AppShell>;
}
