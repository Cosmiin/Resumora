import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import type { JobListItem, JobListPage } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { t } from "../i18n/t.ts";
import { listJobs } from "./jobs-api.ts";
import { AddJobDialog } from "./AddJobDialog.tsx";

const isReading = (job: JobListItem) => job.status === "queued" || job.status === "processing";
const hostOf = (job: JobListItem) => new URL(job.url).host.replace(/^www\./, "");

function uniqueJobs(pages: JobListPage[]) {
  const rows = new Map<string, JobListItem>();
  for (const page of pages) {
    for (const job of page.items) if (!rows.has(job.id)) rows.set(job.id, job);
  }
  return [...rows.values()];
}

export function JobsPage() {
  const userId = useAuth().session?.user.id ?? "anonymous";
  return <JobsList key={userId} userId={userId} />;
}

function JobsList({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
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
    setDialogOpen(true);
  }
  async function added() {
    // A first add removes the empty-state button; use the persistent Add button.
    if (opener.current !== addButton.current && rows.length === 0) opener.current = addButton.current;
    setPollStartedAt(Date.now());
    setPollStopped(false);
    await queryClient.cancelQueries({ queryKey: ["jobs", userId] });
    await query.refetch();
  }

  return (
    <AppShell inert={dialogOpen}>
      <main className="jobs-page" inert={dialogOpen}>
        <div className="jobs-heading">
          <h1>{t("jobs.title")}</h1>
          <button type="button" ref={addButton} onClick={open}>{t("jobs.add")}</button>
        </div>
        <label className="jobs-search">
          {t("jobs.search")}
          <input type="search" value={search} placeholder={t("jobs.searchPlaceholder")}
            onChange={(e) => setSearch(e.target.value)} />
        </label>
        {query.isPending ? <p>{t("app.loading")}</p> : query.isError ? (
          <div className="jobs-state">
            <p role="alert">{t("jobs.loadError")}</p>
            <button type="button" onClick={() => void query.refetch()}>{t("jobs.retry")}</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="jobs-empty">
            <h2>{t("jobs.empty.title")}</h2>
            <p>{t("jobs.empty.text")}</p>
            <button type="button" onClick={open}>{t("jobs.add")}</button>
          </div>
        ) : (
          <>
            {jobs.length === 0 ? <p>{t("jobs.noMatch", { q: search.trim() })}</p> : (
              <ul className="jobs-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <Link className="job-row" to={`/jobs/${job.id}`}>
                      <div className="job-row-details">
                        <h2>{job.title || hostOf(job)}</h2>
                        <p>{[job.company, job.location].filter(Boolean).join(" · ") || hostOf(job)}</p>
                      </div>
                      {isReading(job) ? <span className="job-badge">{t("jobs.badge.reading")}</span>
                        : job.status === "failed" ? <span className="job-badge job-badge-failed">{t("jobs.badge.failed")}</span> : null}
                      <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {pollStopped && busy && <p className="jobs-note">{t("jobs.stillReading")}</p>}
            {!q && query.hasNextPage && <button type="button" className="secondary jobs-load-more" disabled={query.isFetchingNextPage}
              onClick={() => void loadMore()}>{t("jobs.loadMore")}</button>}
          </>
        )}
      </main>
      {dialogOpen && <AddJobDialog onClose={() => setDialogOpen(false)} onAdded={added} />}
    </AppShell>
  );
}