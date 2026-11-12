import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useInfiniteQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import type { JobListItem, JobListPage } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { useT } from "../i18n/t.ts";
import { getLanguage } from "../i18n/language.ts";
import { Skeleton } from "../ui/Page.tsx";
import { remembered } from "../tailor/flow-phase.ts";
import { fetchOpenRun } from "../tailor/open-run.ts";
import { listJobs } from "./jobs-api.ts";
import { AddJobDialog } from "./AddJobDialog.tsx";

const isReading = (job: JobListItem) => job.status === "queued" || job.status === "processing";
const hostOf = (job: JobListItem) => new URL(job.url).host.replace(/^www\./, "");
const DAY = 24 * 60 * 60 * 1000;

function uniqueJobs(pages: JobListPage[]) {
  const rows = new Map<string, JobListItem>();
  for (const page of pages) {
    for (const job of page.items) if (!rows.has(job.id)) rows.set(job.id, job);
  }
  return [...rows.values()];
}

/** How long ago a job was saved, counted in calendar days: today, yesterday, up to six days, then the date. */
export function savedDays(createdAt: string, now = new Date()): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day(now) - day(new Date(createdAt))) / DAY);
}

export function JobsPage() {
  const userId = useAuth().session?.user.id ?? "anonymous";
  return <JobsList key={userId} userId={userId} />;
}

function JobsList({ userId }: { userId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialUrl, setInitialUrl] = useState<string>();
  const [searchParams, setSearchParams] = useSearchParams();
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [pollStopped, setPollStopped] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["jobs", userId], gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listJobs(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => !pollStopped && uniqueJobs(q.state.data?.pages ?? []).some(isReading) ? 3000 : false,
  });
  const rows = uniqueJobs(query.data?.pages ?? []);
  const busy = rows.some(isReading);
  // Unfinished tailoring runs: asked only for the jobs this browser remembers a run for, so most lists ask for none.
  const withRun = rows.filter((job) => remembered(job.id));
  const runs = useQueries({ queries: withRun.map((job) => (
    { queryKey: ["job-tailor-run", userId, job.id], gcTime: 0, queryFn: () => fetchOpenRun(job.id) })) });
  const runOf = new Map(withRun.map((job, index) => [job.id, runs[index]?.data ?? null]));

  useEffect(() => {
    const add = searchParams.get("add");
    if (add === null) return;
    try {
      if (["http:", "https:"].includes(new URL(add).protocol)) {
        opener.current = addButton.current;
        setInitialUrl(add);
        setDialogOpen(true);
      }
    } catch { /* Invalid URL. */ }
    const remaining = new URLSearchParams(searchParams);
    remaining.delete("add");
    setSearchParams(remaining, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (busy) setPollStartedAt((started) => started ?? Date.now());
  }, [busy]);
  useEffect(() => {
    if (pollStartedAt === null) return;
    const timer = setTimeout(() => setPollStopped(true), Math.max(0, pollStartedAt + 120_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [pollStartedAt]);
  useEffect(() => {
    if (!dialogOpen) opener.current?.focus();
  }, [dialogOpen]);

  const q = search.trim().toLowerCase();
  const jobs = rows.filter((job) =>
    [job.title, job.company, job.location, hostOf(job)].some((value) => value?.toLowerCase().includes(q)));

  async function loadMore() {
    // Finish a running refetch so the next page uses its updated cursor.
    if (query.isRefetching) await query.refetch({ cancelRefetch: false });
    await query.fetchNextPage({ cancelRefetch: false });
  }
  function open(event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setInitialUrl(undefined);
    setDialogOpen(true);
  }
  async function added() {
    // A first add removes the empty-state button; use the persistent button in the heading.
    if (opener.current !== addButton.current && rows.length === 0) opener.current = addButton.current;
    setPollStartedAt(Date.now());
    setPollStopped(false);
    await queryClient.cancelQueries({ queryKey: ["jobs", userId] });
    await query.refetch();
  }
  const saved = (job: JobListItem) => {
    const days = savedDays(job.createdAt);
    if (days <= 0) return t("jobs.saved.today");
    if (days === 1) return t("jobs.saved.yesterday");
    if (days < 7) return t("jobs.saved.days", { n: days });
    return t("jobs.saved.on", { date: new Date(job.createdAt).toLocaleDateString(getLanguage() === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "short" }) });
  };
  const loading = query.isPending;
  const failed = query.isError && !query.data;
  const empty = !loading && !failed && rows.length === 0;

  return (
    <AppShell>
      <main className="ui-page jobs-page">
        <div className="ui-wrap ui-main">
          <div className="jobs-head">
            <div>
              <h1 className="ui-title">{t("jobs.title")}</h1>
              {!empty && !failed && <p className="ui-lead jobs-lead">{t("jobs.lead")}</p>}
            </div>
            <button type="button" className="ui-btn" ref={addButton} onClick={open}>{t("jobs.add")}</button>
          </div>
          {loading ? (
            <div className="ui-sheet ui-stack" aria-busy="true">
              <span className="ui-sr" role="status">{t("jobs.loading")}</span>
              <Skeleton width="50%" height="28px" /><Skeleton width="30%" /><hr className="jobs-rule" /><Skeleton width="45%" height="28px" /><Skeleton width="35%" />
            </div>
          ) : failed ? (
            <div className="ui-stack jobs-narrow">
              <p role="alert" className="ui-notice ui-notice--bad">{t("jobs.loadError")}</p>
              <div className="ui-row"><button type="button" className="ui-btn" onClick={() => void query.refetch()}>{t("jobs.retry")}</button></div>
            </div>
          ) : empty ? (
            <div className="ui-empty">
              <h2 className="ui-empty-title">{t("jobs.empty.title")}</h2>
              <p className="ui-empty-text">{t("jobs.empty.text")}</p>
              <div className="ui-row">
                <Link className="ui-btn ui-btn--primary" to="/account/extension">{t("jobs.empty.how")}</Link>
                <button type="button" className="ui-btn ui-btn--quiet" onClick={open}>{t("jobs.add")}</button>
              </div>
            </div>
          ) : (
            <>
              {(
                <label className="jobs-search">
                  <span className="ui-label">{t("jobs.search")}</span>
                  <input className="ui-input" type="search" value={search} placeholder={t("jobs.searchPlaceholder")} onChange={(e) => setSearch(e.target.value)} />
                </label>
              )}
              {jobs.length === 0 ? <p className="ui-notice">{t("jobs.noMatch", { q: search.trim() })}</p> : (
                <>
                  <div className="ui-sheet jobs-table">
                    {/* Column names for the eye only; each cell says its own name to a screen reader. */}
                    <div className="jobs-row jobs-head-row" aria-hidden="true">
                      <span>{t("jobs.col.job")}</span><span>{t("jobs.col.score")}</span><span>{t("jobs.col.cv")}</span>
                      <span>{t("jobs.col.application")}</span><span></span>
                    </div>
                    <ul className="jobs-list">
                      {jobs.map((job) => {
                        const to = `/jobs/${job.id}`;
                        const reading = isReading(job);
                        const ready = job.status === "ready";
                        const run = runOf.get(job.id) ?? null;
                        const languages = job.tailoredLanguages ?? [];
                        // The CV column, first match wins: tailoring under way, a tailored CV, the base CV, the ad still being read.
                        const cvState = run ? <span className="ui-small">{t("jobs.cv.tailoring", { n: run.sections.indexOf(run.currentSection!) + 1, total: run.sections.length })}</span>
                          : languages.length > 0 ? <><span className="ui-pill ui-pill--good">{t("jobs.pill.tailored")}</span><span className="ui-small">{languages.map((code) => code.toUpperCase()).join(", ")}</span></>
                          : ready ? <span className="ui-small">{t("jobs.cv.base")}</span>
                          : reading ? <><span className="jobs-spinner" aria-hidden="true" /><span className="ui-small ui-muted">{t("jobs.cv.reading")}</span></>
                          : job.status === "failed" ? <span className="ui-pill ui-pill--bad">{t("jobs.badge.failed")}</span> : null;
                        return (
                          <li key={job.id} className="jobs-row">
                            <div className="jobs-cell-job">
                              <Link className="job-title" to={to}>{job.title || (reading ? t("jobs.reading.title") : hostOf(job))}</Link>
                              {!reading && <p className="ui-muted">{[job.company, job.location].filter(Boolean).join(", ") || hostOf(job)}</p>}
                              {!reading && (
                                <div className="ui-row">
                                  {job.positionClosed && <span className="ui-pill ui-pill--warn">{t("jobs.pill.closed")}</span>}
                                  <time className="ui-muted ui-small" dateTime={job.createdAt}>{saved(job)}</time>
                                </div>
                              )}
                            </div>
                            <p className="jobs-cell-score">
                              <span className="ui-sr">{t("jobs.col.score")}</span>{" "}
                              <span className={job.score == null ? "jobs-num is-none" : "jobs-num"}>{job.score ?? "–"}</span>
                            </p>
                            <div className="jobs-cell-meta">
                              <div className="jobs-cell-cv">{cvState && <><span className="ui-sr">{t("jobs.col.cv")}</span>{" "}{cvState}</>}</div>
                              <div className="jobs-cell-app">
                                {ready && <><span className="ui-sr">{t("jobs.col.application")}</span>{" "}
                                  <span className="ui-pill">{t(`job.status.${job.applicationStatus ?? "saved"}`)}</span></>}
                              </div>
                            </div>
                            <div className="jobs-cell-act">
                              {run ? <Link className="ui-btn ui-btn--primary ui-btn--sm" to={`${to}/tailor`}>{t("jobs.continue")}</Link>
                                : ready ? <Link className="ui-btn ui-btn--sm" to={to}>{t("jobs.open")}</Link>
                                : !reading ? <Link className="ui-btn ui-btn--sm" to={to}>{t("jobs.view")}</Link> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <p className="ui-small ui-muted jobs-note">{t("jobs.scoreNote")}</p>
                </>
              )}
              {pollStopped && busy && <p className="ui-notice jobs-note">{t("jobs.stillReading")}</p>}
              {!q && query.hasNextPage && <button type="button" className="ui-btn jobs-load-more" disabled={query.isFetchingNextPage}
                onClick={() => void loadMore()}>{t("jobs.loadMore")}</button>}
            </>
          )}
          {query.isError && query.data && (
            <p role="status" className="ui-notice jobs-note">
              {t("jobs.loadError")}{" "}
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => void query.refetch()}>{t("jobs.retry")}</button>
            </p>
          )}
        </div>
      </main>
      {dialogOpen && <AddJobDialog key={initialUrl} initialUrl={initialUrl} onClose={() => setDialogOpen(false)} onAdded={added} />}
    </AppShell>
  );
}
