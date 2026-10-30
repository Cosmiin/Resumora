import { useEffect, useRef, useState } from "react";
import { documentLimits } from "@resumora/contracts/intelligence/model";
import { importedDraft } from "@resumora/contracts/editor/import";
import type { BaseDraft } from "../base/model";
import {
  IntelligenceRequestError,
  type IntelligenceClient,
  type ImportStatus,
} from "../base/intelligence";
import { Button, useCopy } from "./ui";
export function ImportDocument({
  client,
  revision,
  start,
}: {
  client: IntelligenceClient;
  revision: number;
  start: (draft: BaseDraft) => void;
}) {
  const t = useCopy(),
    [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState<ImportStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<ImportStatus[]>([]);
  const operation = useRef<string | null>(null),
    session = useRef(0),
    request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      session.current++;
      request.current?.abort();
    },
    [],
  );
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (
      status?.state === "ready" &&
      status.review &&
      opened.current !== status.id
    ) {
      opened.current = status.id;
      start(importedDraft(status.review));
    }
  }, [status, start]);
  useEffect(() => {
    if (
      !status ||
      !["uploading", "uploaded", "processing"].includes(status.state) ||
      busy
    )
      return;
    const timer = window.setTimeout(() => {
      void run(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [status, busy]);
  useEffect(() => {
    let active = true;
    void client.listImports().then(
      (rows) => {
        if (active) setRecent(rows);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [client]);
  const unresolved = status && ["uploading", "uploaded", "processing", "unknown"].includes(status.state);
  function statusMessage(value: ImportStatus) {
    if (value.error === "STORAGE_OUTCOME_UNKNOWN") return t("Nu putem confirma salvarea fișierului. Procesarea AI nu a început. Păstrăm aceeași operațiune; verifică starea înainte de o nouă încărcare.", "We cannot confirm that the file was saved. AI processing has not started. The same operation is kept; check its status before another upload.");
    if (value.state === "unknown") return t(
      "Nu putem confirma rezultatul acestei încărcări. Fișierul ales și operațiunea sunt păstrate. Verifică operațiunea; nu încărca din nou cât timp rezultatul este necunoscut.",
      "We cannot confirm this upload's outcome. Your selected file and operation are kept. Check this operation; do not upload it again while the outcome is unknown.");
    if (value.state === "cancelled") return t("Import anulat. Poți alege un document pentru o operațiune nouă.", "Import cancelled. You can choose a document for a new operation.");
    if (value.state === "not_cv") return t("Documentul nu a fost identificat ca CV. Alege un CV sau continuă manual.", "This document was not identified as a CV. Choose a CV or continue manually.");
    if (value.state === "uncertain") return t("Nu am putut identifica sigur documentul ca CV. Verifică documentul sau continuă manual.", "We could not confidently identify this document as a CV. Check the document or continue manually.");
    if (value.state === "disabled" || ["AI_DISABLED", "AI_UNCONFIGURED"].includes(value.error ?? "")) return t("Procesarea AI este dezactivată sau neconfigurată. Poți continua manual; nu este necesară o nouă încărcare pentru a verifica starea.", "AI processing is off or unconfigured. You can continue manually; another upload is not needed to check its status.");
    if (["STORAGE_UPLOAD_REJECTED", "STORAGE_UNAVAILABLE"].includes(value.error ?? "")) return t("Fișierul nu a putut fi salvat pentru import. Procesarea AI nu a început. Verifică operațiunea înainte de o nouă încercare.", "The file could not be saved for import. AI processing did not start. Check the operation before another attempt.");
    if ((value.error ?? "").startsWith("DOCUMENT_") || value.error === "ACTIVE_DOCUMENT_CONTENT") return t("Acest document nu poate fi procesat în siguranță sau depășește limitele afișate. Alege un document acceptat sau continuă manual.", "This document cannot be processed safely or exceeds the displayed limits. Choose a supported document or continue manually.");
    return t("Procesarea acestui import nu s-a încheiat cu un rezultat utilizabil. Verifică operațiunea sau continuă manual; nu relansăm automat cereri AI.", "This import did not produce a usable result. Check the operation or continue manually; we do not rerun AI requests automatically.");
  }
  function select(files: FileList | null) {
    if (busy || unresolved) return;
    if (!files || files.length !== 1) {
      setError(t("Alege un singur document.", "Choose one document."));
      return;
    }
    const f = files[0];
    if (
      !/\.(pdf|docx|doc)$/i.test(f.name) ||
      f.size < 1 ||
      f.size > documentLimits.bytes
    ) {
      setError(
        t(
          "PDF, DOCX sau DOC nevid, maximum 10 MB.",
          "Nonempty PDF, DOCX or DOC, maximum 10 MB.",
        ),
      );
      return;
    }
    session.current++;
    request.current?.abort();
    setFile(f);
    setStatus(null);
    setError("");
    operation.current = crypto.randomUUID();
  }
  async function run(checkOnly = false) {
    if (!operation.current || (!file && !checkOnly) || busy) return;
    const generation = session.current,
      operationId = operation.current;
    const active = () =>
      generation === session.current && operationId === operation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = checkOnly
        ? await client.importStatus(operationId, controller.signal)
        : await client.importDocument(
            file!,
            operationId,
            revision,
            controller.signal,
          );
      if (active()) setStatus(result);
    } catch (error) {
      if (active()) {
        const code = error instanceof IntelligenceRequestError ? error.code : "REQUEST_OUTCOME_UNKNOWN";
        const definite = ["AI_DISABLED", "AI_UNCONFIGURED", "DOCUMENT_TYPE", "DOCUMENT_SIZE", "DOCUMENT_PAGES", "DOCUMENT_ENCRYPTED", "DOCUMENT_MALFORMED", "ACTIVE_DOCUMENT_CONTENT"].includes(code);
        setStatus({ id: operationId, state: definite ? "failed" : "unknown", error: code });
        setError("");
      }
    } finally {
      if (active()) setBusy(false);
    }
  }
  return (
    <section className="card file-card">
      <h2>{t("Importă CV-ul", "Import CV")}</h2>
      <p>
        {t(
          "PDF (inclusiv scanat), DOCX sau DOC · maximum 10 MB; PDF: maximum 10 pagini, Word: limite de text. AI identifică întâi un CV, apoi extrage informațiile pentru verificare.",
          "PDF (including scans), DOCX or DOC · maximum 10 MB; PDF: maximum 10 pages, Word: text bounds. AI first identifies a CV, then extracts information for your review.",
        )}
      </p>
      <p className="small muted">
        {t(
          "Documentul este privat. Informațiile extrase rămân neconfirmate până le verifici. Citirea nativă Word și procesarea AI necesită configurare; indisponibilitatea este afișată explicit.",
          "The document is private. Extracted information stays unconfirmed until you review it. Native Word reading and AI processing require configuration; unavailability is shown explicitly.",
        )}
      </p>
      {!!recent.length && (
        <details>
          <summary>
            {t("Importuri recente din cont", "Recent account imports")}
          </summary>
          {recent.map((row) => (
            <Button
              key={row.id}
              disabled={!!unresolved || busy}
              onClick={async () => {
                request.current?.abort();
                const controller = new AbortController();
                request.current = controller;
                const generation = ++session.current,
                  operationId = row.id;
                operation.current = operationId;
                opened.current = null;
                const active = () =>
                  generation === session.current &&
                  operationId === operation.current;
                setFile(null);
                setStatus(null);
                setError("");
                setBusy(true);
                try {
                  const result = await client.importStatus(
                    operationId,
                    controller.signal,
                  );
                  if (active()) setStatus(result);
                } catch {
                  if (active())
                    setError(
                      t(
                        "Importul nu poate fi deschis acum.",
                        "Could not open import now.",
                      ),
                    );
                } finally {
                  if (active()) setBusy(false);
                }
              }}
            >
              {t("Deschide importul salvat", "Open saved import")} ·{" "}
              {row.format?.toUpperCase()} · {row.state}
            </Button>
          ))}
        </details>
      )}
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          select(e.dataTransfer.files);
        }}
      >
        <label className="file-select">
          <span className="btn btn-primary">
            {t("Alege documentul", "Choose document")}
          </span>
          <input
            aria-label={t("Document CV", "CV document")}
            type="file"
            accept=".pdf,.docx,.doc"
            disabled={busy || !!unresolved}
            onChange={(e) => {
              select(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {file && (
          <p>
            {file.name} · {file.size.toLocaleString()} bytes
          </p>
        )}
      </div>
      <div className="actions">
        <Button
          variant="primary"
          disabled={!file || busy || !!status}
          onClick={() => void run()}
        >
          {busy
            ? t("Verificăm documentul…", "Checking document…")
            : t("Încarcă și analizează", "Upload and analyse")}
        </Button>
        {(busy || status || error) && (
          <Button
            disabled={!operation.current || busy}
            onClick={() => void run(true)}
          >
            {t("Verifică operațiunea", "Check operation")}
          </Button>
        )}
        {(busy || status || error) && (
          <Button
            disabled={!operation.current}
            onClick={async () => {
              if (!operation.current) return;
              request.current?.abort();
              const controller = new AbortController();
              request.current = controller;
              const generation = ++session.current,
                operationId = operation.current;
              const active = () =>
                generation === session.current &&
                operationId === operation.current;
              setStatus(null);
              setError("");
              setBusy(true);
              try {
                await client.cancelImport(operationId, controller.signal);
                if (active())
                  setStatus({ id: operationId, state: "cancelled" });
              } catch {
                if (active()) {
                  setStatus({ id: operationId, state: "unknown", error: "CANCELLATION_OUTCOME_UNKNOWN" });
                  setError(t("Anularea nu este confirmată. Verifică aceeași operațiune înainte de o nouă încărcare.", "Cancellation is unconfirmed. Check the same operation before another upload."));
                }
              } finally {
                if (active()) setBusy(false);
              }
            }}
          >
            {t("Anulează importul", "Cancel import")}
          </Button>
        )}
      </div>
      {(busy ||
        (status &&
          ["uploading", "uploaded", "processing"].includes(status.state))) && (
        <div className="import-loading" role="status">
          <span className="import-spinner" aria-hidden="true" />
          <span>
            {t(
              status?.state === "processing" ? "Procesăm CV-ul. Păstrăm aceeași operațiune; poți verifica starea." : status?.state === "uploaded" ? "Fișier salvat. Pregătim procesarea CV-ului…" : "Încărcăm documentul și verificăm salvarea…",
              status?.state === "processing" ? "Processing your CV. The same operation is kept; you can check its status." : status?.state === "uploaded" ? "File saved. Preparing CV processing…" : "Uploading the document and confirming storage…",
            )}
          </span>
        </div>
      )}
      {status &&
        [
          "failed",
          "unknown",
          "uncertain",
          "not_cv",
          "disabled",
          "cancelled",
        ].includes(status.state) && (
          <p role="status">
            {statusMessage(status)}
          </p>
        )}
      {status?.error && <details className="small"><summary>{t("Detalii de diagnostic", "Diagnostic details")}</summary><code>{status.error}</code></details>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
