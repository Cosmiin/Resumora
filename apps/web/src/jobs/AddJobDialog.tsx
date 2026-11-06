import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";
import { createJob } from "./jobs-api.ts";

export function AddJobDialog({ onClose, onAdded, initialUrl }: { onClose(): void; onAdded(): void; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pasteOpen, setPasteOpen] = useState(initialUrl !== undefined);
  const [installOpen, setInstallOpen] = useState(false);
  const [text, setText] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [textError, setTextError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const urlField = useRef<HTMLInputElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  const count = text.trim().length;

  useEffect(() => {
    active.current = true;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { active.current = false; document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    if (pasteOpen) (initialUrl !== undefined ? textField.current : urlField.current)?.focus();
  }, [pasteOpen, initialUrl]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    let validUrl = false;
    try { validUrl = ["http:", "https:"].includes(new URL(url.trim()).protocol); } catch { /* Invalid URL. */ }
    setUrlError(!validUrl);
    setTextError(count < 200);
    setError(null);
    setExistingId(null);
    if (!validUrl || count < 200) {
      if (!validUrl) urlField.current?.focus();
      else textField.current?.focus();
      return;
    }
    setSending(true);
    try {
      const result = await createJob(url.trim(), text);
      if (!result.existing) {
        onAdded();
        if (active.current) onClose();
      } else if (active.current) setExistingId(result.id);
    } catch (err) {
      if (!active.current) return;
      const code = err instanceof ApiClientError ? err.code : "generic";
      switch (code) {
        case "invalid_url": case "text_too_short": case "payload_too_large": case "job_limit":
          setError(t(`jobs.error.${code}`)); break;
        case "network": setError(t("api.network")); break;
        default: setError(t("jobs.error.generic"));
      }
    } finally {
      if (active.current) setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, a[href]");
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div className="jobs-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="add-job-dialog" role="dialog" aria-modal="true" aria-labelledby="add-job-title" onKeyDown={onKeyDown}>
        <header className="jobs-heading">
          <h2 id="add-job-title">{t("jobs.dialog.title")}</h2>
          <button ref={closeButton} type="button" className="secondary jobs-close" aria-label={t("jobs.dialog.close")} onClick={onClose}>×</button>
        </header>
        <section className="jobs-extension" aria-labelledby="job-extension-title">
          <h3 id="job-extension-title">{t("jobs.dialog.extTitle")}</h3>
          <ol>
            <li>{t("jobs.dialog.extStep1")}</li>
            <li>{t("jobs.dialog.extStep2")}</li>
            <li>{t("jobs.dialog.extStep3")}</li>
          </ol>
          <button type="button" className="secondary" aria-expanded={installOpen} aria-controls="job-install-steps"
            onClick={() => setInstallOpen(!installOpen)}>{t("jobs.dialog.installToggle")}</button>
          <ol id="job-install-steps" hidden={!installOpen}>
            <li>{t("jobs.dialog.install1")}</li>
            <li>{t("jobs.dialog.install2")}</li>
            <li>{t("jobs.dialog.install3")}</li>
            <li>{t("jobs.dialog.install4")}</li>
          </ol>
        </section>
        <button type="button" className="secondary jobs-paste-toggle" aria-expanded={pasteOpen} aria-controls="job-paste"
          onClick={() => setPasteOpen(!pasteOpen)}>{t("jobs.dialog.pasteToggle")}</button>
        <div id="job-paste">
          {pasteOpen && (
            <form noValidate onSubmit={(event) => void submit(event)}>
              <label htmlFor="job-url">{t("jobs.dialog.url")}</label>
              <input id="job-url" ref={urlField} type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                aria-invalid={urlError || undefined} aria-describedby={urlError ? "job-url-error" : undefined} />
              {urlError && <p className="jobs-field-error" id="job-url-error">{t("jobs.error.invalid_url")}</p>}
              <label htmlFor="job-text">{t("jobs.dialog.text")}</label>
              <textarea id="job-text" ref={textField} rows={7} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={t("jobs.dialog.textPlaceholder")} aria-invalid={textError || undefined}
                aria-describedby={`job-text-count${textError ? " job-text-error" : ""}`} />
              <p className="jobs-note" id="job-text-count" aria-live="polite">
                {t(count < 200 ? "jobs.dialog.countLow" : "jobs.dialog.count", { n: count.toLocaleString("en") })}
              </p>
              {textError && <p className="jobs-field-error" id="job-text-error">{t("jobs.error.text_too_short")}</p>}
              {existingId && <p role="status">{t("jobs.dialog.duplicate")} <Link to={`/jobs/${existingId}`}>{t("jobs.dialog.openIt")}</Link></p>}
              {error && <p role="alert" className="jobs-field-error">{error}</p>}
              <footer className="jobs-dialog-actions">
                <button type="button" className="secondary" onClick={onClose}>{t("jobs.dialog.cancel")}</button>
                <button type="submit" disabled={sending}>{t("jobs.dialog.submit")}</button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
