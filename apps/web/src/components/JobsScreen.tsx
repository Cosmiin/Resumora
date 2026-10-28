import { useEffect, useRef, useState } from "react";
import type {
  SavedJob,
  RequirementEvidence,
} from "@resumora/contracts/jobs/connected";
import type { AuthTransport } from "../auth/AuthShell";
import { Button, useCopy } from "./ui";
export function JobsScreen({
  transport,
  snapshot,
  ready,
}: {
  transport?: AuthTransport;
  snapshot: { id: string; revision: number } | null;
  ready: boolean;
}) {
  const t = useCopy();
  const [jobs, setJobs] = useState<SavedJob[]>([]),
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
    setTitle(j.intake.title ?? "");
    setCompany(j.intake.company ?? "");
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
      setJobs((old) => [job, ...old.filter((j) => j.id !== job.id)]);
      choose(job);
      setText("");
      setUrl("");
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
            "URL-ul este doar metadată; nu accesăm pagina. Asociem versiunea salvată a ciornei CV, fără să o modificăm.",
            "The URL is metadata only; we do not retrieve the page. We attach the saved CV draft version without changing it.",
          )}
        </p>
        <Button
          variant="primary"
          disabled={
            !transport ||
            !ready ||
            !snapshot ||
            !text.trim() ||
            busy ||
            !!pending.current
          }
          onClick={() =>
            void send("/v1/jobs", {
              requestId: crypto.randomUUID(),
              intake: { text, ...(sourceUrl ? { sourceUrl } : {}) },
              snapshotId: snapshot!.id,
              snapshotRevision: snapshot!.revision,
              requirements: [],
            })
          }
        >
          {busy
            ? t("Se salvează…", "Saving…")
            : t("Salvează ciorna jobului", "Save job draft")}
        </Button>
        {!ready && (
          <p>
            {t("Salvează întâi ciorna CV-ului.", "Save the CV draft first.")}
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
            {j.intake.title || t("Ciornă de revizuit", "Draft to review")} ·{" "}
            {j.state === "reviewed"
              ? t("Revizuit", "Reviewed")
              : t("Ciornă", "Draft")}
          </Button>
        ))}
      </section>
      <section className="card stack">
        {selected ? (
          <>
            <h2>{t("Verifică anunțul", "Review advert")}</h2>
            <p className="small">
              {t("Ciornă CV asociată", "Associated CV draft")} · v
              {selected.snapshotRevision}
            </p>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {selected.intake.text}
            </pre>
            {selected.intake.sourceUrl && <p>{selected.intake.sourceUrl}</p>}
            <label htmlFor="job-title">{t("Titlu", "Title")}</label>
            <input
              id="job-title"
              ref={reviewTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={
                selected.state === "reviewed" || busy || !!pending.current
              }
            />
            <label htmlFor="job-company">{t("Companie", "Company")}</label>
            <input
              id="job-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={
                selected.state === "reviewed" || busy || !!pending.current
              }
            />
            <p className="small">
              {t(
                "Copiază cerințe exacte din anunț și confirmă prioritatea. Restul textului rămâne neclasificat. Fără scor ATS sau extragere AI în această etapă.",
                "Copy exact requirements from the advert and confirm priority. Other text stays unclassified. No ATS score or AI extraction in this stage.",
              )}
            </p>
            {requirements.map((q, i) => (
              <p key={i}>
                <strong>
                  {q.priority === "required"
                    ? t("Obligatoriu", "Required")
                    : t("Preferat", "Preferred")}
                </strong>
                : {q.text}{" "}
                {selected.state === "draft" && (
                  <Button
                    disabled={busy || !!pending.current}
                    onClick={() =>
                      setRequirements(requirements.filter((_, n) => n !== i))
                    }
                  >
                    {t("Elimină", "Remove")}
                  </Button>
                )}
              </p>
            ))}
            {selected.state === "draft" && (
              <>
                <label htmlFor="requirement-excerpt">
                  {t("Fragment exact", "Exact excerpt")}
                </label>
                <textarea
                  id="requirement-excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  disabled={busy || !!pending.current}
                />
                <select
                  aria-label={t("Prioritate", "Priority")}
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as typeof priority)
                  }
                >
                  <option value="required">
                    {t("Obligatoriu", "Required")}
                  </option>
                  <option value="preferred">
                    {t("Preferat", "Preferred")}
                  </option>
                </select>
                <Button
                  disabled={
                    busy ||
                    !!pending.current ||
                    !excerpt.trim() ||
                    excerpt.length > 1000 ||
                    !selected.intake.text.includes(excerpt)
                  }
                  onClick={() => {
                    setRequirements([
                      ...requirements,
                      { text: excerpt, priority },
                    ]);
                    setExcerpt("");
                  }}
                >
                  {t("Adaugă cerința", "Add requirement")}
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    !!pending.current ||
                    !title.trim() ||
                    !company.trim()
                  }
                  onClick={() =>
                    void send("/v1/jobs/" + selected.id + "/review", {
                      requestId: crypto.randomUUID(),
                      title,
                      company,
                      requirements,
                    })
                  }
                >
                  {t("Confirmă detaliile", "Confirm details")}
                </Button>
              </>
            )}
          </>
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
