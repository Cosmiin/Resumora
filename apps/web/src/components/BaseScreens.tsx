import type { IntelligenceClient } from "../base/intelligence";
import { ImportDocument } from "./ImportDocument";
import { useContext, useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  FileText,
  Upload,
  Plus,
  MessageSquare,
  History,
} from "lucide-react";
import { blankDraft, type BaseDraft, type PartialDate } from "../base/model";
import type { Route } from "../base/routes";
import type { Snapshot } from "../base/adapter";
import { maraReviewDraft } from "../base/fixture";
import { selectDocument, type FileSelection } from "../base/validation";
import { Button, Pill, LanguageContext, useCopy } from "./ui";
import { DocumentPreview } from "./DocumentPreview";
export function StartChooser({
  start,
  intelligence,
  revision = 0,
  profile,
  updatesDisabled,
  applyUpdate,
  openImportId,
  onOpenImport,
}: {
  openImportId?: string;
  onOpenImport?: (id: string) => void;
  start: (draft: BaseDraft) => void;
  intelligence?: IntelligenceClient;
  revision?: number;
  profile?: BaseDraft | null;
  updatesDisabled?: boolean;
  applyUpdate?: (next: BaseDraft, original: BaseDraft) => boolean;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<FileSelection>({ state: "empty" }),
    [mode, setMode] = useState<"choose" | "file">(
      intelligence ? "file" : "choose",
    );
  const manualDraft = () => ({
    ...blankDraft(),
    language: locale,
    documentLocale: locale === "ro" ? "ro-RO" : "en-GB",
  });
  if (profile)
    return (
      <div className="start-layout">
        <section className="card">
          <p role="status">
            {t(
              "Șterge CV-ul de bază actual înainte de a încărca altul.",
              "Delete your current Base CV before uploading another.",
            )}
          </p>
        </section>
      </div>
    );
  if (intelligence)
    return (
      <div className="profile-start-document">
        <ImportDocument
          instantUpload
          openImportId={openImportId}
          onOpenImport={onOpenImport}
          client={intelligence}
          revision={revision}
          start={start}
          profile={profile}
          updatesDisabled={updatesDisabled}
          applyUpdate={applyUpdate}
        />
        <Button
          className="btn btn-ghost profile-start-manual"
          onClick={() => start(manualDraft())}
        >
          {t("Începe fără CV", "Start without a CV")}
        </Button>
      </div>
    );
  return (
    <div className="start-layout">
      <section className="card start-card">
        <span className="icon-tile">
          <FileText />
        </span>
        <h2>{t("Încep de la zero", "Start from scratch")}</h2>
        <p>
          {t(
            "Adaugă informațiile pe care le cunoști. Poți lăsa datele și secțiunile opționale pentru mai târziu.",
            "Add the facts you know. Dates and optional sections can wait until later.",
          )}
        </p>
        <Button variant="primary" onClick={() => start(manualDraft())}>
          {t("Completează manual", "Enter manually")}
          <ArrowRight size={16} />
        </Button>
      </section>
      <section className="card start-card">
        <span className="icon-tile">
          <Upload />
        </span>
        <h2>{t("Am deja un CV", "I already have a CV")}</h2>
        <p>
          {t(
            "Importă un PDF, DOCX sau DOC pentru verificare asistată de AI când procesarea este configurată. Poți completa și manual.",
            "Import a PDF, DOCX or DOC for AI-assisted review when document processing is configured. Manual entry is always available.",
          )}
        </p>
        <Button onClick={() => setMode("file")}>
          {t("Alege un document", "Choose a document")}
        </Button>
      </section>
      {mode === "file" && intelligence && (
        <ImportDocument
          instantUpload
          openImportId={openImportId}
          onOpenImport={onOpenImport}
          client={intelligence}
          revision={revision}
          start={start}
          profile={profile}
          updatesDisabled={updatesDisabled}
          applyUpdate={applyUpdate}
        />
      )}
      {mode === "file" && !intelligence && (
        <section className="card file-card">
          <h2>{t("Document existent", "Existing document")}</h2>
          <p>
            {t(
              "Fișierul nu va fi citit, încărcat sau păstrat. Selectăm doar numele și dimensiunea; nu verificăm siguranța sau conținutul.",
              "The file will not be read, uploaded, or stored. Only name and size are selected; safety and content are not checked.",
            )}
          </p>
          <div
            className="dropzone"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              setFile(
                e.dataTransfer.files.length === 1
                  ? selectDocument(e.dataTransfer.files[0])
                  : { state: "multiple" },
              );
            }}
          >
            <p>
              {t(
                "Trage un PDF/DOCX aici sau alege un fișier.",
                "Drop a PDF/DOCX here or choose a file.",
              )}
            </p>
            <input
              ref={picker}
              hidden
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => {
                if (e.target.files?.[0])
                  setFile(selectDocument(e.target.files[0]));
                e.target.value = "";
              }}
            />
            <Button onClick={() => picker.current?.click()}>
              {t("Selectează PDF sau DOCX", "Select PDF or DOCX")}
            </Button>
          </div>
          <div role="status">
            {file.name && (
              <p>
                <b>{file.name}</b> ·{" "}
                {new Intl.NumberFormat(locale).format(file.size ?? 0)}{" "}
                {t("octeți", "bytes")}
              </p>
            )}
            {file.state === "unavailable" ? (
              <p className="notice">
                {t(
                  "Selectat local. Nu a fost încărcat sau extras. Introdu manual informațiile pentru a continua.",
                  "Selected locally. Not uploaded or extracted. Enter the facts manually to continue.",
                )}
              </p>
            ) : file.state === "multiple" ? (
              <p className="field-error">
                {t(
                  "Alege un singur fișier sau continuă manual.",
                  "Choose one file or continue manually.",
                )}
              </p>
            ) : file.state === "unsupported" ? (
              <p className="field-error">
                {t(
                  "Selectează un PDF/DOCX nevid sau continuă manual. Extensia nu dovedește tipul real al fișierului.",
                  "Select a nonempty PDF/DOCX or continue manually. The extension does not prove the actual file type.",
                )}
              </p>
            ) : (
              <p>{t("Niciun fișier selectat.", "No file selected.")}</p>
            )}
          </div>
          <div className="actions">
            <Button variant="primary" onClick={() => start(manualDraft())}>
              {t("Continuă manual", "Continue manually")}
            </Button>
            <Button
              onClick={() => {
                setFile({ state: "empty" });
                setMode("choose");
              }}
            >
              {t("Anulează selectarea", "Cancel selection")}
            </Button>
          </div>
        </section>
      )}
      <section className="example-card">
        <h3>{t("Vrei să explorezi înainte?", "Want to explore first?")}</h3>
        <p>
          {t(
            "Deschide cazul sintetic Mara. Un câmp extras rămâne de confirmat. Nu sunt datele unei persoane reale.",
            "Open the synthetic Mara case. One extracted field still needs confirmation. This is not a real person’s data.",
          )}
        </p>
        <Button onClick={() => start(maraReviewDraft())}>
          {t("Explorează exemplul Mara", "Explore Mara example")}
        </Button>
      </section>
    </div>
  );
}
export function HomeScreen({
  durable = false,
  draft,
  head,
  go,
  reopen,
}: {
  durable?: boolean;
  draft: boolean;
  head: Snapshot | null;
  go: (route: Route) => void;
  reopen: () => void;
}) {
  const t = useCopy();
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">
            {t(
              "O poveste profesională, bine spusă",
              "Your professional story, clearly told",
            )}
          </p>
          <h2>
            {t(
              "Pune experiența ta într-o formă care te reprezintă.",
              "Put your experience into words that represent you.",
            )}
          </h2>
          <p>
            {durable
              ? t(
                  "Construiește un CV de bază, adaugă context și păstrează versiuni în contul tău.",
                  "Build a Base CV, add context, and keep versions in your account.",
                )
              : t(
                  "Construiește un CV de bază din informații reale. Revizuiește, adaugă context și păstrează versiuni în această sesiune.",
                  "Build a Base CV from real facts. Review, add context, and keep versions during this session.",
                )}
          </p>
          <Button
            variant="primary"
            onClick={() => go(draft ? "base" : "start")}
          >
            {draft
              ? t("Continuă CV-ul de bază", "Continue Base CV")
              : t("Creează CV-ul de bază", "Create Base CV")}
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="hero-paper" aria-hidden="true">
          <FileText size={36} />
          <span />
          <span />
          <span />
          <hr />
          <span />
          <span />
        </div>
      </section>
      <div className="home-grid">
        <section className="card">
          <span className="icon-tile">
            <FileText />
          </span>
          <h2>{t("CV-ul tău de bază", "Your Base CV")}</h2>
          {head ? (
            <>
              <Pill tone="good">
                v{head.revision} ·{" "}
                {durable
                  ? t("în contul tău", "in your account")
                  : t("în această sesiune", "in this session")}
              </Pill>
              <p>{head.draft.name.value}</p>
              <Button onClick={reopen}>
                {t("Redeschide versiunea salvată", "Reopen saved version")}
              </Button>
            </>
          ) : (
            <>
              <p>
                {durable
                  ? t(
                      "Nu ai salvat încă o versiune.",
                      "No version has been saved yet.",
                    )
                  : t(
                      "Nu ai salvat încă o versiune în această sesiune.",
                      "No version has been saved in this session.",
                    )}
              </p>
              <Button onClick={() => go("start")}>
                <Plus size={16} />
                {t("Începe aici", "Start here")}
              </Button>
            </>
          )}
        </section>
        <section className="card">
          <span className="icon-tile">
            <MessageSquare />
          </span>
          <h2>
            {t("Mai mult decât o listă de roluri", "More than a list of roles")}
          </h2>
          <p>
            {t(
              "Întrebări scurte despre contribuțiile tale, fără obligația de a inventa cifre.",
              "Short questions about your contributions, with no pressure to invent numbers.",
            )}
          </p>
          <Button onClick={() => go(draft ? "enrich" : "start")}>
            {t("Adaugă context", "Add context")}
          </Button>
        </section>
      </div>
    </>
  );
}
export function HistoryScreen({
  durable = false,
  draft,
  versions,
  head,
  inspected,
  setInspected,
  restore,
  go,
  asOf,
}: {
  durable?: boolean;
  draft: boolean;
  versions: Snapshot[];
  head: Snapshot | null;
  inspected: Snapshot | null;
  setInspected: (s: Snapshot | null) => void;
  restore: (s: Snapshot) => void;
  go: (r: Route) => void;
  asOf: PartialDate;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const inspectionHeading = useRef<HTMLHeadingElement>(null);
  const pendingInspection = useRef<string | null>(null);
  function revealInspection() {
    inspectionHeading.current?.focus({ preventScroll: true });
    inspectionHeading.current?.scrollIntoView?.({ block: "start" });
  }
  useEffect(() => {
    if (inspected && pendingInspection.current === inspected.id) {
      pendingInspection.current = null;
      revealInspection();
    }
  }, [inspected]);
  function inspect(snapshot: Snapshot) {
    if (inspected?.id === snapshot.id) revealInspection();
    else pendingInspection.current = snapshot.id;
    setInspected(snapshot);
  }
  return (
    <>
      <p className="muted">
        {durable
          ? t(
              "Versiunile sunt păstrate în cont. Restaurarea creează o versiune nouă fără să rescrie istoricul.",
              "Versions are saved in your account. Restoring creates a new version without rewriting history.",
            )
          : t(
              "Versiunile sunt copii în memoria paginii. Restaurarea creează o versiune nouă și nu rescrie sursele sau istoricul.",
              "Versions are copies in page memory. Restoring creates a new version and never rewrites sources or history.",
            )}
      </p>
      {!versions.length ? (
        <section className="card empty">
          <History size={32} />
          <h2>{t("Nicio versiune salvată", "No saved versions")}</h2>
          <Button onClick={() => go(draft ? "base" : "start")}>
            {t("Deschide editorul", "Open editor")}
          </Button>
        </section>
      ) : (
        <div className="history-layout">
          {inspected && (
            <section
              className="stack history-inspection"
              aria-labelledby="history-inspection-heading"
            >
              <h2
                id="history-inspection-heading"
                ref={inspectionHeading}
                tabIndex={-1}
              >
                {t("Inspectezi", "Inspecting")} v{inspected.revision}
              </h2>
              <DocumentPreview draft={inspected.draft} asOf={asOf} />
              {inspected.draft.answers.length > 0 && (
                <section
                  className="card"
                  aria-label={t(
                    "Context profesional salvat",
                    "Saved career context",
                  )}
                >
                  {inspected.draft.answers.map((a) => (
                    <div key={a.id}>
                      <p>
                        <strong>{a.questionText}</strong>
                      </p>
                      <p style={{ whiteSpace: "pre-wrap" }}>{a.text}</p>
                    </div>
                  ))}
                </section>
              )}
              <Button onClick={() => setInspected(null)}>
                {t("Închide inspecția", "Close inspection")}
              </Button>
            </section>
          )}
          <div className="stack history-versions">
            {versions.map((v) => (
              <section className="card version-card" key={v.id}>
                <div className="section-heading">
                  <h2>
                    v{v.revision} · {v.draft.name.value}
                  </h2>
                  {v.id === head?.id && (
                    <Pill tone="good">{t("Curent", "Current")}</Pill>
                  )}
                </div>
                <p>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(v.createdAt))}
                </p>
                <p className="small">
                  {v.reason === "restore"
                    ? t("Restaurare · copie nouă", "Restore · new copy")
                    : v.reason === "autosave"
                      ? t("Salvare automată", "Autosave")
                      : t("Salvare explicită", "Explicit save")}{" "}
                  · {v.draft.language.toUpperCase()}
                </p>
                <Button onClick={() => inspect(v)}>
                  {t("Inspectează", "Inspect")} v{v.revision}
                </Button>
                {v.id !== head?.id && (
                  <Button onClick={() => restore(v)}>
                    {t("Restaurează", "Restore")} v{v.revision}
                  </Button>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
