import { useRef, useState, type DragEvent, type Ref } from "react";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api-error.ts";
import { startImport } from "./imports-api.ts";

/** Same limits as the API, checked first so a wrong file never leaves the browser. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /\.(pdf|docx)$/i;

/** Checks a chosen CV file, uploads it and reports the new import's id. `picker` is the hidden file input; `open` shows it. */
function useUpload(onStarted: (importId: string) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = ""; // choosing the same file again still fires
    if (!file || busy) return;
    setProblem(null);
    if (!ACCEPTED.test(file.name)) return setProblem(t("import.unsupported"));
    if (file.size > MAX_BYTES) return setProblem(t("import.tooLarge"));
    setBusy(true);
    try {
      onStarted((await startImport(file)).id);
    } catch (err) {
      setProblem(err instanceof ApiClientError && err.status !== 0 && err.status < 500 ? err.message : t("import.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      hidden
      aria-label={t("import.choose")}
      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      onChange={(e) => void choose(e.target.files?.[0])}
    />
  );
  return { busy, problem, choose, picker, open: () => input.current?.click() };
}

/** "Import CV" in the top bar: picks a CV file, uploads it and reports the new import's id. */
export function ImportButton({ onStarted, ref }: { onStarted(importId: string): void; ref?: Ref<HTMLButtonElement> }) {
  const upload = useUpload(onStarted);
  return (
    <>
      {upload.picker}
      <button ref={ref} type="button" className="secondary" disabled={upload.busy} onClick={upload.open}>
        {upload.busy ? t("import.uploading") : t("import.button")}
      </button>
      {upload.problem && <p role="alert" className="form-error">{upload.problem}</p>}
    </>
  );
}

/** The start of the flow, when there is no CV yet: drop a file here or choose one. */
export function UploadDrop({ onStarted }: { onStarted(importId: string): void }) {
  const upload = useUpload(onStarted);
  const [over, setOver] = useState(false);
  const drag = (inside: boolean) => (e: DragEvent) => {
    e.preventDefault();
    setOver(inside);
  };
  return (
    <>
      {upload.problem && <p role="alert" className="ui-notice ui-notice--bad">{upload.problem}</p>}
      <div className={over ? "cv-drop is-over" : "cv-drop"} onDragOver={drag(true)} onDragLeave={drag(false)}
        onDrop={(e) => {
          drag(false)(e);
          void upload.choose(e.dataTransfer.files[0]);
        }}>
        {upload.picker}
        <p className="ui-coach">{t("import.drop")}</p>
        <button type="button" className="ui-btn ui-btn--primary" disabled={upload.busy} onClick={upload.open}>
          {upload.busy ? t("import.uploading") : t("import.chooseFile")}
        </button>
        <p className="ui-muted ui-small">{t("import.fileNote")}</p>
      </div>
    </>
  );
}
