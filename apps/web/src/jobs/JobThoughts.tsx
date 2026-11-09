import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { MicButton, micAvailable, VoiceStatus } from "../cv/enrich/VoiceControls.tsx";
import { ApiClientError } from "../lib/api.ts";
import { t } from "../i18n/t.ts";

type Props = { value: string | null; onSave(value: string): Promise<unknown>; onBusyChange?(busy: boolean): void };

export function JobThoughts({ value, onSave, onBusyChange }: Props) {
  const [text, setText] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(text);
  const accepted = useRef(text);
  const inFlight = useRef<string | null>(null);
  const queued = useRef<string | null>(null);
  const failed = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (inFlight.current !== null || document.activeElement === field.current || latest.current !== accepted.current) return;
    latest.current = value ?? "";
    accepted.current = latest.current;
    setText(latest.current);
  }, [value]);
  const saveAfterVoice = useRef(false);
  const voice = useVoice({ locale: "en" });
  const { state, onFinal } = voice;
  const recording = state === "recording";
  const counting = state === "countdown";
  const busy = recording || counting || state === "asking" || state === "stopping";
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const micShown = micAvailable(voice);
  const save = useCallback(async () => {
    if (inFlight.current !== null) {
      queued.current = latest.current === inFlight.current ? null : latest.current;
      return;
    }
    if (latest.current === accepted.current) return;
    queued.current = latest.current;
    setSaving(true);
    try {
      while (queued.current !== null) {
        const sent = queued.current;
        queued.current = null;
        if (sent === accepted.current) continue;
        inFlight.current = sent;
        setError(null);
        try {
          await onSave(sent);
          accepted.current = sent;
          failed.current = false;
        } catch (cause) {
          failed.current = true;
          setError(t(cause instanceof ApiClientError && cause.code === "version_conflict"
            ? "jobs.error.version_conflict" : "jobs.error.generic"));
        }
      }
    } finally { inFlight.current = null; setSaving(false); }
  }, [onSave]);
  const cleanup = useRef({ save, stop: voice.stop, busy });
  useLayoutEffect(() => { cleanup.current = { save, stop: voice.stop, busy }; }, [save, voice.stop, busy]);
  useLayoutEffect(() => () => {
    // Stop before useVoice's passive cleanup closes the microphone.
    const current = cleanup.current;
    if (current.busy) current.stop();
    if (!failed.current && latest.current !== accepted.current) void current.save();
  }, []);
  useEffect(() => {
    onFinal((words) => {
      latest.current = [latest.current.trimEnd(), words].filter(Boolean).join(" ").slice(0, 2000);
      setText(latest.current);
    });
  }, [onFinal]);
  useEffect(() => {
    if (!busy && saveAfterVoice.current) {
      saveAfterVoice.current = false;
      void save();
    }
  }, [busy, save]);
  const message = state === "denied" ? t("job.thoughts.voiceDenied") : state === "limit" ? t("job.thoughts.voiceLimit")
    : state === "idle" && voice.interrupted ? t("job.thoughts.voiceInterrupted") : null;
  return <section className="job-thoughts">
    <label htmlFor="job-thoughts">{t("job.thoughts.title")}</label>
    <div className="job-thoughts-field">
      <textarea id="job-thoughts" ref={field} maxLength={2000} rows={4} value={text} lang="en"
        placeholder={t("job.thoughts.placeholder")} aria-describedby="job-thoughts-count"
        onChange={(event) => { latest.current = event.target.value.slice(0, 2000); setText(latest.current); }}
        onBlur={() => { if (busy) saveAfterVoice.current = true; else void save(); }} />
      {micShown && <MicButton voice={voice} startLabel={t("job.thoughts.voiceStart")} stopLabel={t("job.thoughts.voiceStop")}
        onMouseDown={(event) => event.preventDefault()} onPress={() => field.current?.focus()} />}
    </div>
    <span id="job-thoughts-count" className="jobs-note">{t("job.thoughts.count", { n: text.length })}</span>
    <VoiceStatus voice={voice} />
    {message && <p role="status" className="jobs-note">{message}</p>}
    {saving && <p role="status" className="jobs-note">{t("job.thoughts.saving")}</p>}
    {error && <p role="alert" className="jobs-field-error">{error}</p>}
  </section>;
}
