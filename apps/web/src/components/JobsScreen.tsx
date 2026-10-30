import { JobWorkflowPanel } from "./JobWorkflow";
import { useEffect, useRef, useState } from "react";
import type {
  SavedJob,
  JobSummary,
  RequirementEvidence,
} from "@resumora/contracts/jobs/connected";
import type { AuthTransport } from "../auth/AuthShell";
import { Button, useCopy } from "./ui";
export function JobsScreen({
  transport,
  snapshot,
  ready,
  openCv,
}: {
  transport?: AuthTransport;
  snapshot: { id: string; revision: number } | null;
  ready: boolean;
  openCv?: (job: { id: string; label: string }) => void;
}) {
  const t = useCopy();
  const [jobs, setJobs] = useState<JobSummary[]>([]),
    [selected, setSelected] = useState<SavedJob | null>(null);
  const [text, setText] = useState(""),
    [sourceUrl, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [company, setCompany] = useState("");
  const [requirements, setRequirements] = useState<RequirementEvidence[]>([]),
    [excerpt, setExcerpt] = useState(""),
    [priority, setPriority] = useState<"required" | "preferred">("required");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLTextAreaElement>(null),
    reviewTitle = useRef<HTMLInputElement>(null);
  const pending = useRef<{ path: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    input.current?.focus();
    if (transport)
      void transport("/v1/jobs")
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const data = await r.json();
          if (!cancelled) setJobs(data);
        })
        .catch(() => {
          if (!cancelled)
            setMessage(
              t("Nu am putut încărca joburile.", "Could not load jobs."),
            );
        });
    return () => {
      cancelled = true;
    };
  }, [transport]);
  function choose(j: SavedJob) {
    setSelected(j);
    setTitle(
      j.intake.title ??
        (typeof j.intake.extracted?.title === "string"
          ? j.intake.extracted.title
          : ""),
    );
    setCompany(
      j.intake.company ??
        (typeof j.intake.extracted?.company === "string"
          ? j.intake.extracted.company
          : ""),
    );
    setRequirements(j.requirements);
    setMessage("");
    setTimeout(() => reviewTitle.current?.focus(), 0);
  }
  async function send(path: string, body: unknown) {
    if (!transport || busy) return;
    const request = pending.current ?? { path, body: JSON.stringify(body) };
    pending.current = request;
    setBusy(true);
    setMessage("");
    try {
      const r = await transport(request.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: request.body,
      });
      if (!r.ok) {
        if ([400, 404, 409, 410, 413, 422].includes(r.status))
          pending.current = null;
        throw new Error();
      }
      const job: SavedJob = await r.json();
      pending.current = null;
      setJobs((old) => [
        {
          id: job.id,
          state: job.state,
          createdAt: job.createdAt,
          title: Array.from(job.intake.title ?? "")
            .slice(0, 200)
            .join(""),
        },
        ...old.filter((j) => j.id !== job.id),
      ]);
      choose(job);
      if (request.path === "/v1/jobs") {
        setText("");
        setUrl("");
      }
      setMessage(t("Salvat în cont.", "Saved to your account."));
    } catch {
      setMessage(
        pending.current
          ? t(
              "Rezultat necunoscut. Reîncearcă aceeași cerere; textul este păstrat.",
              "Outcome unknown. Retry the same request; your text is retained.",
            )
          : t(
              "Nu s-a salvat. Verifică datele și versiunea CV-ului.",
              "Could not save. Check the fields and CV version.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function detail(id: string) {
    if (!transport) return;
    setBusy(true);
    try {
      const r = await transport("/v1/jobs/" + id);
      if (!r.ok) throw new Error();
      choose(await r.json());
    } catch {
      setMessage(t("Jobul nu este disponibil.", "Job unavailable."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor-layout">
      <section className="card stack">
        <h2>{t("Job țintă", "Target vacancy")}</h2>
        <p>
          {t(
            "Lipește anunțul. Se salvează ca ciornă; verifici detaliile după salvare.",
            "Paste the advert. It saves as a draft; review details afterward.",
          )}
        </p>
        {!transport && (
          <p role="status">
            {t(
              "Salvarea joburilor necesită un cont conectat.",
              "Saving jobs requires a connected account.",
            )}
          </p>
        )}
        <label htmlFor="vacancy-text">
          {t("Textul anunțului", "Advert text")}
        </label>
        <textarea
          id="vacancy-text"
          ref={input}
          rows={9}
          maxLength={200000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!!pending.current || busy}
        />
        <label htmlFor="vacancy-url">
          {t("URL sursă (opțional)", "Source URL (optional)")}
        </label>
        <input
          id="vacancy-url"
          type="url"
          value={sourceUrl}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!pending.current || busy}
        />
        <p className="small muted">
          {t(
            "Salvează textul cu link sursă sau importă dintr-un URL public. Asociem cel mai recent CV salvat, dacă există.",
            "Save text with a source link, or import from a public URL. The server associates the latest saved Base when available.",
          )}
        </p>
        <Button
          variant="primary"
          disabled={!transport || !text.trim() || busy || !!pending.current}
          onClick={() =>
            void send("/v1/jobs", {
              requestId: crypto.randomUUID(),
              intake: { text, ...(sourceUrl ? { sourceUrl } : {}) },
              snapshotId: null,
              snapshotRevision: null,
              requirements: [],
            })
          }
        >
          {busy
            ? t("Se salvează…", "Saving…")
            : t("Salvează ciorna jobului", "Save job draft")}
        </Button>
        <Button disabled={!transport||!sourceUrl.trim()||busy||!!pending.current}
          onClick={()=>void send('/v1/jobs/url',{requestId:crypto.randomUUID(),url:sourceUrl})}>
          {t('Importă din URL public','Import from public URL')}
        </Button>
        <p className="small">{t('Importul public acceptă momentan Greenhouse, Ashby, Lever și SmartRecruiters când oferă un JobPosting public. Pentru alte pagini, lipește textul sau folosește extensia.','Public URL import currently reads Greenhouse, Ashby, Lever and SmartRecruiters when a public JobPosting is provided. For other pages, paste text or use the extension.')}</p>
        {!snapshot && (
          <p>
            {t(
              "Poți salva jobul acum. CV-ul de bază va fi necesar pentru analiză și adaptare.",
              "Save the job now. A saved Base CV is needed for analysis and tailoring.",
            )}
          </p>
        )}
        {pending.current && (
          <Button
            disabled={busy}
            onClick={() => void send(pending.current!.path, null)}
          >
            {t("Reîncearcă aceeași cerere", "Retry same request")}
          </Button>
        )}
        {message && <p role="status">{message}</p>}
        <h3>{t("Joburi salvate", "Saved jobs")}</h3>
        {!jobs.length && <p>{t("Niciun job încă.", "No jobs yet.")}</p>}
        {jobs.map((j) => (
          <Button
            key={j.id}
            disabled={busy || !!pending.current}
            onClick={() => void detail(j.id)}
          >
            {j.title || t("Ciornă de revizuit", "Draft to review")} ·{" "}
            {j.state === "reviewed"
              ? t("Revizuit", "Reviewed")
              : t("Ciornă", "Draft")}
          </Button>
        ))}
      </section>
      <section className="card stack">
        {selected && transport ? (
          <JobWorkflowPanel key={selected.id} job={selected} transport={transport} ready={ready} onOpenJob={id=>void detail(id)}
            openCv={openCv?()=>openCv({id:selected.id,label:selected.intake.title||t('Ciornă de job','Job draft')}):undefined}/>
        ) : (
          <p>
            {t(
              "Alege un job salvat pentru a-l verifica.",
              "Choose a saved job to review it.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
