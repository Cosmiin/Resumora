import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiClientError } from "../lib/api.ts";
import { useT } from "../i18n/t.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { createJob } from "./jobs-api.ts";

/** "Add a job by hand": the ad's link and its text, for when the browser extension isn't used. */
export function AddJobDialog({ onClose, onAdded, initialUrl }: { onClose(): void; onAdded(): void; initialUrl?: string }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [text, setText] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [textError, setTextError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const urlField = useRef<HTMLInputElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const active = useRef(true);
  const count = text.trim().length;

  useEffect(() => {
    active.current = true;
    // A link that came with the page (from the extension's "add it by hand") only needs the text.
    (initialUrl !== undefined ? textField.current : urlField.current)?.focus();
    return () => { active.current = false; };
  }, [initialUrl]);

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

  return (
    <Dialog open onClose={onClose} title={t("jobs.dialog.title")}>
      <form noValidate className="ui-stack" onSubmit={(event) => void submit(event)}>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="job-url">{t("jobs.dialog.url")}</label>
          <input className="ui-input" id="job-url" ref={urlField} type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            aria-invalid={urlError || undefined} aria-describedby={urlError ? "job-url-error" : undefined} />
          {urlError && <span className="ui-field-error" id="job-url-error">{t("jobs.error.invalid_url")}</span>}
        </div>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="job-text">{t("jobs.dialog.text")}</label>
          <textarea className="ui-input" id="job-text" ref={textField} rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t("jobs.dialog.textPlaceholder")} aria-invalid={textError || undefined}
            aria-describedby={`job-text-count${textError ? " job-text-error" : ""}`} />
          <span className="ui-field-hint" id="job-text-count" aria-live="polite">
            {t(count < 200 ? "jobs.dialog.countLow" : "jobs.dialog.count", { n: count.toLocaleString("en") })}
          </span>
          {textError && <span className="ui-field-error" id="job-text-error">{t("jobs.error.text_too_short")}</span>}
        </div>
        {existingId && <p role="status" className="ui-notice">{t("jobs.dialog.duplicate")} <Link to={`/jobs/${existingId}`}>{t("jobs.dialog.openIt")}</Link></p>}
        {error && <p role="alert" className="ui-notice ui-notice--bad">{error}</p>}
        <div className="ui-dialog-actions">
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose}>{t("jobs.dialog.cancel")}</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={sending}>{t("jobs.dialog.submit")}</button>
        </div>
      </form>
    </Dialog>
  );
}
