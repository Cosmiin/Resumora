import { useContext, useState, useRef } from "react";
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
export function StartChooser({ start }: { start: (draft: BaseDraft) => void }) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<FileSelection>({ state: "empty" }),
    [mode, setMode] = useState<"choose" | "file">("choose");
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
        <Button variant="primary" onClick={() => start(blankDraft())}>
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
            "Selectarea unui fișier poate fi verificată local. Încărcarea și extragerea PDF/DOCX nu sunt conectate.",
            "File selection can be checked locally. PDF/DOCX upload and extraction are not connected.",
          )}
        </p>
        <Button onClick={() => setMode("file")}>
          {t("Alege un document", "Choose a document")}
        </Button>
      </section>
      {mode === "file" && (
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
            <Button variant="primary" onClick={() => start(blankDraft())}>
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
export function Sources({ draft }: { draft: BaseDraft }) {
  const t = useCopy();
  return (
    draft && (
      <details className="card sources">
        <summary>
          {t("Surse și informații de verificat", "Sources and facts to review")}
        </summary>
        {draft.sources.map((s) => (
          <div key={s.id}>
            <h3>
              {s.kind === "manual"
                ? t("Introducere manuală", "Manual entry")
                : s.kind === "answer"
                  ? t("Răspunsul tău", "Your answer")
                  : t("Exemplu sintetic Mara", "Synthetic Mara example")}
            </h3>
            {s.text && <blockquote>{s.text}</blockquote>}
            {s.locator && <p className="small">{s.locator}</p>}
            <p className="small muted">
              {s.kind === "fixture" ? s.label : s.id}
            </p>
          </div>
        ))}
        {draft.referenceProse.map((p) => (
          <div className="notice" key={p.id}>
            <b>
              {t(
                "Text de referință · în așteptare · nefolosit în CV",
                "Reference wording · pending · unused in CV",
              )}
            </b>
            <p>{p.text}</p>
            <small>{p.claimIds.join(", ")}</small>
          </div>
        ))}
        <p className="small">
          {t(
            "Identificatorii example/dev sunt referințe locale, nu ID-uri de bază de date. Confirmarea este auto-declarată.",
            "example/dev identifiers are local references, not database IDs. Confirmation is self-reported.",
          )}
        </p>
      </details>
    )
  );
}
export function HomeScreen({
  draft,
  head,
  go,
  reopen,
}: {
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
            {t(
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
                v{head.revision} · {t("în această sesiune", "in this session")}
              </Pill>
              <p>{head.draft.name.value}</p>
              <Button onClick={reopen}>
                {t("Redeschide versiunea salvată", "Reopen saved version")}
              </Button>
            </>
          ) : (
            <>
              <p>
                {t(
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
  draft,
  versions,
  head,
  inspected,
  setInspected,
  restore,
  go,
  asOf,
}: {
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
  return (
    <>
      <p className="muted">
        {t(
          "Versiunile sunt copii în memoria paginii. Restaurarea creează o versiune nouă și nu rescrie sursele sau istoricul.",
          "Versions are copies in page memory. Restoring creates a new version and never rewrites sources or history.",
        )}
      </p>
      {!versions.length ? (
        <section className="card empty">
          <History size={32} />
          <h2>{t("Nicio versiune salvată", "No saved versions")}</h2>
          <Button onClick={() => go(draft ? "base" : "start")}>
            {t("Deschide CV-ul de bază", "Open Base CV")}
          </Button>
        </section>
      ) : (
        <div className="history-layout">
          <div className="stack">
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
                    : t("Salvare explicită", "Explicit save")}{" "}
                  · {v.draft.language.toUpperCase()}
                </p>
                <Button onClick={() => setInspected(v)}>
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
          {inspected && (
            <section className="stack">
              <h2>
                {t("Inspectezi", "Inspecting")} v{inspected.revision}
              </h2>
              <DocumentPreview draft={inspected.draft} asOf={asOf} />
              <Button onClick={() => setInspected(null)}>
                {t("Închide inspecția", "Close inspection")}
              </Button>
            </section>
          )}
        </div>
      )}
    </>
  );
}
