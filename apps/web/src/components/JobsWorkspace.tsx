import {
  canonicalContentLocale,
  contentLocale,
} from "@resumora/contracts/editor/content-language";
import { documentLocaleKey } from "../base/routes";
import { languageClient } from "../languages/client";
import { contentLanguageChoices } from "../languages/catalog";
import type { DocumentLanguageContext } from "@resumora/contracts/editor/language-transport";
import { useContext, useEffect, useState } from "react";
import type { WorkspaceLocation } from "../base/routes";
import type { BaseDraft } from "../base/model";
import type { Snapshot } from "../base/adapter";
import type { SavedJob, JobSummary } from "@resumora/contracts/jobs/connected";
import type { WorkspaceDraft } from "@resumora/contracts/editor/workspace";
import {
  WorkspaceContext,
  useWorkspaceDraft,
  DraftStatus,
} from "../workspace/context";
import { Button, LanguageContext, useCopy } from "./ui";
import { JobWorkflowPanel } from "./JobWorkflow";
import { JobAnswersPanel } from "./JobAnswersPanel";
import { DeleteJobButton } from "./DeleteJobButton";
export function JobsWorkspace({
  location,
  profile,
  snapshot,
  ready,
  navigate,
  onDocument,
  onProfileAccepted,
  onJobDeleted,
}: {
  location: WorkspaceLocation;
  profile: BaseDraft | null;
  snapshot: Snapshot | null;
  ready: boolean;
  navigate: (route: string) => void;
  onDocument: (
    jobId: string,
    label: string,
    locale: string,
    revisionKey: string,
  ) => void;
  onProfileAccepted: (saved: Snapshot) => void;
  onJobDeleted?: (id: string) => void;
}) {
  const registry = useContext(WorkspaceContext)!,
    t = useCopy();
  const [jobs, setJobs] = useState<JobSummary[]>([]),
    [drafts, setDrafts] = useState<WorkspaceDraft[]>([]),
    [message, setMessage] = useState(""),
    [loadingJobs, setLoadingJobs] = useState(true),
    [listRefresh, setListRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (location.view === "jobs") {
      setLoadingJobs(true);
      setMessage("");
      let jobsFailed = false,
        draftsFailed = false;
      const reportFailure = () => {
        if (active)
          setMessage(
            jobsFailed
              ? t(
                  "Nu putem încărca joburile salvate.",
                  "Saved jobs could not be loaded.",
                )
              : draftsFailed
                ? t(
                    "Joburile salvate sunt afișate. Nu putem încărca momentan anunțurile începute.",
                    "Your saved jobs are shown. Unfinished adverts could not be loaded right now.",
                  )
                : "",
          );
      };
      void registry.json<JobSummary[]>("/v1/jobs").then(
        (j) => {
          if (!active) return;
          registry.opened("#/jobs");
          setJobs(j.filter((job) => !registry.deletedJobs.has(job.id)));
          setLoadingJobs(false);
        },
        () => {
          if (active) {
            jobsFailed = true;
            setLoadingJobs(false);
            reportFailure();
          }
        },
      );
      void registry.json<WorkspaceDraft[]>("/v1/workspace-drafts").then(
        (d) => {
          if (active)
            setDrafts(
              d.filter((v) => v.kind === "intake" && !v.submittedJobId),
            );
        },
        () => {
          draftsFailed = true;
          reportFailure();
        },
      );
    }
    return () => {
      active = false;
    };
  }, [registry, location.view, listRefresh]);
  function deleted(id: string) {
    registry.forgetJob(id);
    setJobs((old) => old.filter((job) => job.id !== id));
    onJobDeleted?.(id);
  }
  if (!registry.transport)
    return (
      <section className="card">
        <h2>{t("Joburile mele", "My Jobs")}</h2>
        <p>
          {t(
            "Conectează un cont pentru joburi și CV-uri adaptate salvate.",
            "Connect an account to save jobs and tailored CVs.",
          )}
        </p>
      </section>
    );
  if (location.view === "intake")
    return (
      <Intake
        key={location.draftId}
        id={location.draftId!}
        navigate={navigate}
      />
    );
  if (location.jobId)
    return (
      <JobWorkspace
        key={location.jobId}
        id={location.jobId}
        location={location}
        profile={profile}
        snapshot={snapshot}
        ready={ready}
        navigate={navigate}
        onDocument={onDocument}
        onProfileAccepted={onProfileAccepted}
        onDeleted={(id) => {
          deleted(id);
          navigate("#/jobs");
        }}
        onMissing={() => {
          setMessage(
            t(
              "Jobul nu mai este disponibil în cont.",
              "This job is no longer available in your account.",
            ),
          );
          navigate("#/jobs");
        }}
      />
    );
  return (
    <div className="stack">
      <div className="section-heading">
        <h1>{t("Joburile mele", "My Jobs")}</h1>
        <Button
          variant="primary"
          onClick={() => navigate(`#/jobs/new/${crypto.randomUUID()}`)}
        >
          {t("Adaptează CV-ul pentru un job", "Tailor my CV for a job")}
        </Button>
      </div>
      {!!drafts.length && (
        <section className="stack">
          <h2>
            {t("Continuă un anunț început", "Continue an unfinished advert")}
          </h2>
          {drafts.map((d) => (
            <article key={d.id} className="card">
              <p>
                {String(
                  d.value.text ||
                    d.value.sourceUrl ||
                    t("Anunț nou", "New advert"),
                ).slice(0, 200)}
              </p>
              <Button onClick={() => navigate(`#/jobs/new/${d.id}`)}>
                {t("Continuă", "Continue")}
              </Button>
            </article>
          ))}
        </section>
      )}
      {loadingJobs && (
        <p role="status">{t("Încărcăm joburile…", "Loading jobs…")}</p>
      )}
      {!loadingJobs && !jobs.length && !message && (
        <section className="card">
          <p>
            {t(
              "Adaugă primul job. Poți adapta CV-ul fără să închei toate întrebările din profil.",
              "Add your first job. You can tailor your CV without completing every profile question.",
            )}
          </p>
        </section>
      )}
      {jobs.map((job) => (
        <article className="card stack" key={job.id}>
          <h2>{job.title || t("Job de revizuit", "Job to review")}</h2>
          <p>
            {[job.company, job.location, job.workArrangement]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <Button onClick={() => navigate(`#/jobs/${job.id}`)}>
            {t("Deschide spațiul jobului", "Open job workspace")}
          </Button>
          <DeleteJobButton
            jobId={job.id}
            title={job.title || t("Job salvat", "Saved job")}
            transport={registry.transport!}
            onDeleted={deleted}
          />
        </article>
      ))}
      {message && (
        <div className="notice">
          <p role="alert">{message}</p>
          <Button onClick={() => setListRefresh((v) => v + 1)}>
            {t("Reîncearcă încărcarea", "Retry loading")}
          </Button>
        </div>
      )}
    </div>
  );
}
function Intake({
  id,
  navigate,
}: {
  id: string;
  navigate: (route: string) => void;
}) {
  const registry = useContext(WorkspaceContext)!,
    t = useCopy(),
    interfaceLocale = useContext(LanguageContext),
    draft = useWorkspaceDraft("intake", id, { text: "", sourceUrl: "" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (draft.ready) registry.opened(`#/jobs/new/${id}`);
  }, [registry, draft.ready, id]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!(await draft.flush())) throw Error();
      const row = draft.controller.snapshot();
      const job = await registry.json<SavedJob>(
        `/v1/jobs/intakes/${id}/submit`,
        {
          requestId: crypto.randomUUID(),
          expectedRevision: row.revision,
          interfaceLocale,
        },
      );
      navigate(`#/jobs/${job.id}`);
    } catch {
      setError(
        t(
          "Nu am putut confirma trimiterea. Anunțul este păstrat; reîncearcă aceeași ciornă.",
          "Submission is unconfirmed. Your advert is retained; retry this same draft.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h1>{t("Adaugă un job", "Add a job")}</h1>
      <p>
        {t(
          "Lipește anunțul. Ciorna se salvează automat; AI începe când alegi să verifici jobul.",
          "Paste the advert. Your draft saves automatically; AI starts when you review the job.",
        )}
      </p>
      <label>
        {t("Textul anunțului", "Advert text")}
        <textarea
          className="native"
          rows={6}
          maxLength={200000}
          value={draft.value.text}
          disabled={!draft.ready || busy}
          onChange={(e) => draft.set({ ...draft.value, text: e.target.value })}
        />
      </label>
      <details
        className="intake-link"
        open={draft.value.sourceUrl ? true : undefined}
      >
        <summary>
          {t("Sau folosește un link către job", "Or use a job link")}
        </summary>
        <label>
          {t("URL sursă", "Source URL")}
          <input
            className="native"
            type="url"
            placeholder="https://"
            value={draft.value.sourceUrl}
            disabled={!draft.ready || busy}
            onChange={(e) =>
              draft.set({ ...draft.value, sourceUrl: e.target.value })
            }
          />
        </label>
      </details>
      {(draft.value.text ||
        draft.value.sourceUrl ||
        draft.dirty ||
        draft.error) && <DraftStatus draft={draft} />}
      <div className="actions">
        <Button
          variant="primary"
          disabled={
            busy ||
            !draft.ready ||
            (!draft.value.text.trim() && !draft.value.sourceUrl.trim())
          }
          onClick={() => void submit()}
        >
          {busy
            ? t("Pregătim verificarea…", "Preparing review…")
            : t("Verifică jobul", "Review job")}
        </Button>
        <Button onClick={() => navigate("#/jobs")}>
          {t("Înapoi la joburi", "Back to jobs")}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function JobWorkspace({
  id,
  location,
  profile,
  snapshot,
  ready,
  navigate,
  onDocument,
  onProfileAccepted,
  onMissing,
  onDeleted,
}: {
  id: string;
  location: WorkspaceLocation;
  profile: BaseDraft | null;
  snapshot: Snapshot | null;
  ready: boolean;
  navigate: (route: string) => void;
  onDocument: (
    id: string,
    label: string,
    locale: string,
    revision: string,
  ) => void;
  onProfileAccepted: (saved: Snapshot) => void;
  onMissing: () => void;
  onDeleted: (id: string) => void;
}) {
  const registry = useContext(WorkspaceContext)!,
    t = useCopy();
  const [job, setJob] = useState<SavedJob | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [hasCv, setHasCv] = useState(false),
    [workflowTitle, setWorkflowTitle] = useState("");
  const interfaceLocale = useContext(LanguageContext);
  const [languages, setLanguages] = useState<DocumentLanguageContext>();
  const [languageError, setLanguageError] = useState(false);
  const savedLocale = languages?.source?.accepted
    ? languages.source.locale
    : languages?.versions[0]?.locale;
  const locale =
      location.locale ??
      savedLocale ??
      (profile ? contentLocale(profile) : interfaceLocale),
    panel = location.panel ?? "details";
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setLanguageError(false);
    setLanguages(undefined);
    if (!job) return;
    if (!registry.transport) {
      setLanguageError(true);
      return;
    }
    void languageClient(registry.transport)
      .context(id, undefined, abort.signal)
      .then(
        (context) => {
          if (!active) return;
          if (
            ![
              ...context.versions.map((v) => v.locale),
              ...(context.source ? [context.source.locale] : []),
            ].every((value) => canonicalContentLocale(value))
          ) {
            setLanguageError(true);
            return;
          }
          setLanguages(context);
        },
        () => {
          if (active) setLanguageError(true);
        },
      );
    return () => {
      active = false;
      abort.abort();
    };
  }, [registry, job, id, refresh]);
  useEffect(() => {
    if (languages && !location.locale && ["cv", "appearance"].includes(panel))
      navigate(`#/jobs/${id}/cv/${encodeURIComponent(locale)}?panel=${panel}`);
  }, [languages, location.locale, panel, id, locale, navigate]);
  const jobTitle =
    workflowTitle || job?.intake.title || t("Spațiul jobului", "Job workspace");
  useEffect(() => {
    document.title = `${jobTitle} · ${locale.toUpperCase()} · Resumora`;
  }, [jobTitle, locale]);
  useEffect(() => {
    let active = true;
    void registry.json<SavedJob>(`/v1/jobs/${id}`).then(
      (j) => {
        if (active) setJob(j);
      },
      (error) => {
        if (active) {
          if (error instanceof Error && error.message === "missing")
            onMissing();
          else
            setError(
              t(
                "Jobul nu este disponibil în cont.",
                "This job is unavailable in your account.",
              ),
            );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [registry, id]);
  useEffect(() => {
    let active = true;
    if (job && languages)
      void registry
        .json<{ id: string; revision: number } | null>(
          `/v1/jobs/${id}/cv?locale=${locale}`,
        )
        .then(
          (cv) => {
            if (!active) return;
            setHasCv(!!cv);
            if (cv)
              onDocument(
                id,
                job.intake.title || t("Job salvat", "Saved job"),
                locale,
                `${cv.id}:${cv.revision}`,
              );
          },
          () => {
            if (active)
              setError(
                t(
                  "CV-ul nu poate fi încărcat acum.",
                  "The CV could not be loaded.",
                ),
              );
          },
        );
    return () => {
      active = false;
    };
  }, [registry, job, id, locale, refresh, languages]);
  useEffect(() => {
    if (job) registry.opened(location.canonical);
  }, [registry, job, location.canonical]);
  const choose = (value: string) =>
    navigate(`#/jobs/${id}/cv/${encodeURIComponent(locale)}?panel=${value}`);
  if (error && !job)
    return (
      <section className="card">
        <p role="alert">{error}</p>
        <Button onClick={() => navigate("#/jobs")}>
          {t("Înapoi la joburi", "Back to jobs")}
        </Button>
      </section>
    );
  if (!job) return <p role="status">{t("Deschidem jobul…", "Opening job…")}</p>;
  if (!languages)
    return (
      <section className="card">
        <p role={languageError ? "alert" : "status"}>
          {languageError
            ? t(
                "Versiunile CV-ului salvat nu pot fi încărcate. Reîncearcă pentru a deschide documentul corect.",
                "Saved CV versions could not be loaded. Retry to open the correct document.",
              )
            : t(
                "Încărcăm versiunile CV-ului salvat…",
                "Loading saved CV versions…",
              )}
        </p>
        {languageError && (
          <Button onClick={() => setRefresh((v) => v + 1)}>
            {t("Reîncearcă", "Retry")}
          </Button>
        )}
      </section>
    );
  const savedChoices = [
    ...new Map(
      [...languages.versions.map((v) => v.locale), locale].map((value) => [
        documentLocaleKey(value),
        value,
      ]),
    ).values(),
  ];
  return (
    <div className="stack job-workspace">
      <div className="section-heading">
        <div>
          <Button variant="ghost" onClick={() => navigate("#/jobs")}>
            {t("Înapoi la joburi", "Back to jobs")}
          </Button>
          <h1>{jobTitle}</h1>
          <p>
            {t(
              "CV independent pentru acest job",
              "Independent CV for this job",
            )}{" "}
            · {locale.toUpperCase()}
          </p>
        </div>
        <div className="stack">
          <label>
            {t("Limba CV-ului", "CV language")}
            <select
              className="native"
              value={locale}
              onChange={(e) =>
                navigate(
                  `#/jobs/${id}/cv/${encodeURIComponent(e.target.value)}?panel=${panel}`,
                )
              }
            >
              {savedChoices.map((value) => (
                <option key={value} value={value}>
                  {contentLanguageChoices([value]).find(
                    (choice) => choice.code === value,
                  )?.label ?? value}{" "}
                  · {value}
                </option>
              ))}
            </select>
          </label>
          <DeleteJobButton
            jobId={id}
            title={jobTitle}
            transport={registry.transport!}
            onDeleted={onDeleted}
          />
        </div>
      </div>
      <nav
        className="workspace-tabs"
        aria-label={t("Secțiunile jobului", "Job sections")}
      >
        {(
          [
            ["details", t("Detaliile jobului", "Job details")],
            ["cv", "CV"],
            ["answers", t("Întrebări și răspunsuri", "Questions and answers")],
            ["appearance", t("Aspect și limbă", "Appearance and language")],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={panel === key ? "primary" : "secondary"}
            aria-current={panel === key ? "page" : undefined}
            onClick={() => choose(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div hidden={panel === "appearance"}>
        <JobWorkflowPanel
          job={job}
          transport={registry.transport!}
          ready={ready}
          panel={panel === "appearance" ? "cv" : panel}
          locale={locale}
          onOpenJob={(next) => navigate(`#/jobs/${next}`)}
          openCv={() => {
            setRefresh((v) => v + 1);
            choose("cv");
          }}
          onChanged={() => setRefresh((v) => v + 1)}
          onTitle={setWorkflowTitle}
        />
      </div>
      {panel === "answers" && (
        <JobAnswersPanel
          jobId={id}
          profile={profile}
          snapshot={snapshot}
          ready={ready}
          onProfileAccepted={onProfileAccepted}
          refresh={refresh}
        />
      )}
      {(panel === "cv" || panel === "appearance") && !hasCv && (
        <section className="card">
          <p>
            {t(
              "Nu există încă un CV acceptat în această limbă. Creează și verifică o propunere; profilul și celelalte CV-uri rămân păstrate.",
              "There is no accepted CV in this language yet. Create and review a proposal; your profile and other CVs remain unchanged.",
            )}
          </p>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
