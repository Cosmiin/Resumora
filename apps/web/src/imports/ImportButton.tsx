import { useRef, useState, type Ref } from "react";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api-error.ts";
import { startImport } from "./imports-api.ts";

/** Same limits as the API, checked first so a wrong file never leaves the browser. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /\.(pdf|docx)$/i;

/** Picks a CV file, uploads it and reports the new import's id. */
export function ImportButton({ onStarted, ref }: { onStarted(importId: string): void; ref?: Ref<HTMLButtonElement> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = ""; // choosing the same file again still fires
    if (!file) return;
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

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        aria-label={t("import.choose")}
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <button ref={ref} type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t("import.uploading") : t("import.button")}
      </button>
      {problem && <p role="alert" className="form-error">{problem}</p>}
    </>
  );
}
