import { useContext } from "react";
import { ActivityAnimation } from "./ActivityAnimation";
import { useImportSession } from "../base/useImportSession";
import { WorkspaceContext } from "../workspace/context";
import { InitialImportReview } from "./InitialImportReview";
import type { BaseDraft } from "../base/model";
import {
  type IntelligenceClient,
  type ImportStatus,
} from "../base/intelligence";
import { Button, useCopy } from "./ui";
import { hasProfileInformation } from "../base/import-updates";
import { ImportProfileUpdates } from "./ImportProfileUpdates";
export function ImportDocument(
  props: React.ComponentProps<typeof ImportDocumentSession>,
) {
  const t = useCopy();
  if (props.profile)
    return (
      <section className="card">
        <p role="status">
          {t(
            "Șterge CV-ul de bază actual înainte de a încărca altul.",
            "Delete your current Base CV before uploading another.",
          )}
        </p>
      </section>
    );
  return <ImportDocumentSession {...props} />;
}
function ImportDocumentSession({
  client,
  revision,
  start,
  profile,
  updatesDisabled = false,
  applyUpdate,
  openImportId,
  onOpenImport,
  instantUpload = false,
}: {
  instantUpload?: boolean;
  openImportId?: string;
  onOpenImport?: (id: string) => void;
  client: IntelligenceClient;
  revision: number;
  start: (draft: BaseDraft) => void;
  profile?: BaseDraft | null;
  updatesDisabled?: boolean;
  applyUpdate?: (next: BaseDraft, original: BaseDraft) => boolean;
}) {
  const registry = useContext(WorkspaceContext);
  const t = useCopy();
  const {
    file,
    status,
    busy,
    error: errorCode,
    recent,
    readingSeconds,
    restarting,
    unresolved,
    failedImport,
    operationId,
    select,
    openSavedImport,
    restartImport,
    discardReview,
    cancel,
    upload,
    check,
    consume,
  } = useImportSession({
    client,
    revision,
    openImportId,
    onOpenImport,
    instantUpload,
  });
  const error =
    errorCode === "SELECT_ONE_DOCUMENT"
      ? t("Alege un singur document.", "Choose one document.")
      : errorCode === "DOCUMENT_SELECTION_INVALID"
        ? t(
            "PDF, DOCX sau DOC nevid, maximum 10 MB.",
            "Nonempty PDF, DOCX or DOC, maximum 10 MB.",
          )
        : errorCode === "DISCARD_UNCONFIRMED"
          ? t(
              "Nu am putut confirma renunțarea la verificare. Încearcă din nou.",
              "We could not confirm that the review was discarded. Try again.",
            )
          : errorCode
            ? t(
                "Nu am putut opri încercarea anterioară. Verifică conexiunea și încearcă din nou.",
                "We could not stop the previous attempt. Check your connection and try again.",
              )
            : "";
  function statusMessage(value: ImportStatus) {
    if (
      ["AI_TIMEOUT_UNKNOWN", "IMPORT_PROCESSING_TIMEOUT"].includes(
        value.error ?? "",
      )
    )
      return t(
        "Nu am putut termina citirea CV-ului la timp. Încarcă fișierul din nou pentru a începe de la capăt.",
        "We could not finish reading your CV in time. Upload the file again to start over.",
      );
    if (value.error === "IMPORT_NOT_FOUND")
      return t(
        "Acest import nu mai este disponibil. Încarcă CV-ul din nou pentru a începe de la capăt.",
        "This import is no longer available. Upload your CV again to start over.",
      );
    if (value.state === "unknown")
      return t(
        "Nu am putut finaliza importul CV-ului. Alege «Încarcă CV-ul din nou» pentru a începe de la capăt.",
        "We could not complete your CV import. Choose ‘Upload CV again’ to start over.",
      );
    if (value.state === "cancelled")
      return t(
        "Import anulat. Poți alege un document pentru o operațiune nouă.",
        "Import cancelled. You can choose a document for a new operation.",
      );
    if (value.state === "not_cv")
      return t(
        "Documentul nu a fost identificat ca CV. Alege un CV sau continuă manual.",
        "This document was not identified as a CV. Choose a CV or continue manually.",
      );
    if (value.state === "uncertain")
      return t(
        "Nu am putut identifica sigur documentul ca CV. Verifică documentul sau continuă manual.",
        "We could not confidently identify this document as a CV. Check the document or continue manually.",
      );
    if (
      value.state === "disabled" ||
      ["AI_DISABLED", "AI_UNCONFIGURED"].includes(value.error ?? "")
    )
      return t(
        "Procesarea AI este dezactivată sau neconfigurată. Poți continua manual; nu este necesară o nouă încărcare pentru a verifica starea.",
        "AI processing is off or unconfigured. You can continue manually; another upload is not needed to check its status.",
      );
    if (
      ["STORAGE_UPLOAD_REJECTED", "STORAGE_UNAVAILABLE"].includes(
        value.error ?? "",
      )
    )
      return t(
        "Fișierul nu a putut fi salvat pentru import. Procesarea AI nu a început. Verifică operațiunea înainte de o nouă încercare.",
        "The file could not be saved for import. AI processing did not start. Check the operation before another attempt.",
      );
    if (
      (value.error ?? "").startsWith("DOCUMENT_") ||
      value.error === "ACTIVE_DOCUMENT_CONTENT"
    )
      return t(
        "Acest document nu poate fi procesat în siguranță sau depășește limitele afișate. Alege un document acceptat sau continuă manual.",
        "This document cannot be processed safely or exceeds the displayed limits. Choose a supported document or continue manually.",
      );
    return t(
      "Nu am putut finaliza importul CV-ului. Încarcă fișierul din nou pentru a începe de la capăt.",
      "We could not complete your CV import. Upload the file again to start over.",
    );
  }
  if (status?.state === "ready" && status.review) {
    const discard = async () => {
      const id = await discardReview();
      if (id) registry?.discardImport(id);
    };
    const content = hasProfileInformation(profile) ? (
      <ImportProfileUpdates
        profile={profile}
        review={status.review}
        profileRevision={revision}
        client={client}
        disabled={updatesDisabled || busy}
        apply={(next, original) => {
          const applied = applyUpdate?.(next, original) ?? false;
          if (applied) consume();
          return applied;
        }}
        cancel={discard}
      />
    ) : (
      <InitialImportReview
        key={status.review.id}
        review={status.review}
        client={client}
        disabled={updatesDisabled || busy}
        start={(next) => {
          consume();
          start(next);
        }}
        cancel={discard}
      />
    );
    return (
      <>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {content}
      </>
    );
  }
  return (
    <section
      className={`card file-card${failedImport ? " import-retry-state" : ""}`}
    >
      <h2>{t("Începe cu CV-ul tău", "Start with your CV")}</h2>
      {hasProfileInformation(profile) && (
        <p className="notice">
          {hasProfileInformation(profile)
            ? t(
                "Încarcă un CV actualizat care îți aparține. Profilul reprezintă o singură persoană; CV-ul altcuiva poate amesteca experiențele. Vei verifica diferențele înainte de a alege ce adaugi sau actualizezi.",
                "Upload an updated CV that belongs to you. A profile represents one person; someone else's CV could mix their experience with yours. You will review differences before choosing what to add or update.",
              )
            : t(
                "Acest profil reprezintă o singură persoană. Încarcă doar propriul CV.",
                "This profile represents one person. Upload only your own CV.",
              )}
        </p>
      )}
      <p className="upload-introduction">
        {t(
          "Alege propriul CV. Îl citim cu AI, apoi verifici informațiile direct în profil.",
          "Choose your CV. We’ll read it with AI, then you can check the information in your profile.",
        )}
      </p>
      <details className="upload-details">
        <summary>
          {t(
            "Formate acceptate și confidențialitate",
            "Supported formats and privacy",
          )}
        </summary>
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
      </details>
      {!!recent.length && (
        <details>
          <summary>
            {t("Importuri recente din cont", "Recent account imports")}
          </summary>
          {recent.map((row) => (
            <Button
              key={row.id}
              onClick={() => {
                openSavedImport(row.id);
              }}
            >
              {t("Deschide importul salvat", "Open saved import")} ·{" "}
              {row.format?.toUpperCase()} ·{" "}
              {row.state === "ready"
                ? t("Pregătit pentru verificare", "Ready to review")
                : row.state === "processing"
                  ? t("În curs de citire", "Reading your CV")
                  : row.state === "uploaded"
                    ? t("Încărcat", "Uploaded")
                    : row.state === "unknown"
                      ? t("Necesită atenție", "Needs attention")
                      : row.state === "cancelled"
                        ? t("Anulat", "Cancelled")
                        : t("Verifică detaliile", "Check details")}
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
            {instantUpload
              ? t("Încarcă CV-ul", "Upload your CV")
              : t("Alege documentul", "Choose document")}
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
      {failedImport && status && (
        <p className="import-retry-message" role="status">
          {statusMessage(status)}
        </p>
      )}
      <div className="actions">
        {failedImport && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void restartImport()}
          >
            {t("Încarcă CV-ul din nou", "Upload CV again")}
          </Button>
        )}
        {!instantUpload && !failedImport && (
          <Button
            variant="primary"
            disabled={!file || busy || !!status}
            onClick={() => void upload()}
          >
            {busy
              ? t("Verificăm documentul…", "Checking document…")
              : t("Încarcă și analizează", "Upload and analyse")}
          </Button>
        )}
        {(busy || status || error) && (
          <Button disabled={!operationId || busy} onClick={() => void check()}>
            {instantUpload
              ? t("Verifică progresul", "Check progress")
              : t("Verifică operațiunea", "Check operation")}
          </Button>
        )}
        {(busy || status || error) &&
          !failedImport &&
          !(status?.state === "ready" && hasProfileInformation(profile)) && (
            <Button disabled={!operationId} onClick={() => void cancel()}>
              {t("Anulează importul", "Cancel import")}
            </Button>
          )}
      </div>
      {(busy ||
        (status &&
          ["uploading", "uploaded", "processing"].includes(status.state))) && (
        <div className="import-loading" role="status">
          <ActivityAnimation kind="reading" />
          <span>
            {restarting
              ? t("Pregătim o nouă încărcare…", "Preparing a new upload…")
              : t(
                  status?.state === "processing"
                    ? status.stage === "extracting"
                      ? "Citim experiența, studiile și competențele tale…"
                      : "Verificăm documentul tău…"
                    : status?.state === "uploaded"
                      ? "CV-ul tău este încărcat. Pregătim citirea…"
                      : !file
                        ? "Deschidem importul salvat…"
                        : "Încărcăm documentul și verificăm salvarea…",
                  status?.state === "processing"
                    ? status.stage === "extracting"
                      ? "Reading your experience, education and skills…"
                      : "Checking your document…"
                    : status?.state === "uploaded"
                      ? "Your CV is uploaded. Getting ready to read it…"
                      : !file
                        ? "Opening saved import…"
                        : "Uploading the document and confirming storage…",
                )}
          </span>
          <p className="import-loading-hint">
            {status?.state === "processing"
              ? t(
                  readingSeconds >= 30
                    ? "Încă citim CV-ul tău cu atenție. Documentele detaliate pot dura câteva minute. Poți închide această pagină și reveni; procesarea continuă."
                    : "Citirea unui CV detaliat poate dura câteva minute. Când terminăm, vei putea verifica și corecta informațiile.",
                  readingSeconds >= 30
                    ? "We’re still reading your CV carefully. Detailed documents can take a few minutes. You can close this page and return; processing continues."
                    : "Reading a detailed CV can take a few minutes. When it is ready, you can review and correct the information.",
                )
              : !file && !status
                ? t(
                    "Verificăm dacă acest import mai este disponibil…",
                    "Checking whether this import is still available…",
                  )
                : status?.stage === "queued"
                  ? t(
                      "Citirea începe automat. Poți reveni la acest import din contul tău, chiar dacă închizi pagina.",
                      "Reading starts automatically. You can return to this import from your account, even if you close this page.",
                    )
                  : t(
                      "Îți păstrăm documentul în siguranță. Nu trebuie să îl încarci din nou.",
                      "Keeping your document safe. You do not need to upload it again.",
                    )}
          </p>
        </div>
      )}
      {status &&
        !failedImport &&
        [
          "failed",
          "unknown",
          "uncertain",
          "not_cv",
          "disabled",
          "cancelled",
        ].includes(status.state) && (
          <p role="status">{statusMessage(status)}</p>
        )}
      {error && <p role="alert">{error}</p>}
      {status?.error && (
        <details className="small">
          <summary>{t("Detalii de diagnostic", "Diagnostic details")}</summary>
          <code>{status.error}</code>
        </details>
      )}
    </section>
  );
}
