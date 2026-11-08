import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tone } from "@resumora/shared";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { t } from "../i18n/t.ts";

const TONES: Tone[] = ["formal", "neutral", "confident"];
const MAX = 500;

/** A mic button that appends what was said to a text field; hidden when voice isn't available. */
export function useDictation(append: (words: string) => void) {
  const voice = useVoice({ locale: "en" });
  const latest = useRef(append);
  useLayoutEffect(() => { latest.current = append; });
  useEffect(() => { voice.onFinal((words) => latest.current(words)); }, [voice.onFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const recording = voice.state === "recording" || voice.state === "countdown";
  const shown = !["denied", "unavailable", "limit"].includes(voice.state);
  const mic = shown && <button type="button" className="secondary tailor-mic" aria-pressed={recording}
    aria-label={t(recording ? "tailor.voice.stop" : "tailor.voice.start")}
    disabled={voice.state === "asking" || voice.state === "stopping"}
    onClick={() => { if (recording) voice.stop(); else if (voice.state === "idle") voice.start(); }}>
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="5.5" y="1" width="5" height="9" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
  </button>;
  return { mic, partial: voice.partial };
}

type Props = { sections: number; busy: boolean; onStart(steering: { tone: Tone; instruction: string }): void };

export function SteeringStep({ sections, busy, onStart }: Props) {
  const [tone, setTone] = useState<Tone>("neutral");
  const [instruction, setInstruction] = useState("");
  const { mic, partial } = useDictation((words) => setInstruction((text) => [text.trimEnd(), words].filter(Boolean).join(" ").slice(0, MAX)));
  return <section className="tailor-card">
    <h2>{t("tailor.steer.title")}</h2>
    <div className="tailor-pills" role="group" aria-label={t("tailor.steer.tone")}>
      {TONES.map((value) => <button key={value} type="button" aria-pressed={tone === value}
        className={tone === value ? "tailor-pill is-on" : "tailor-pill"} onClick={() => setTone(value)}>
        {t(`tailor.tone.${value}`)}
      </button>)}
    </div>
    <label htmlFor="tailor-instruction">{t("tailor.steer.instruction")}</label>
    <div className="tailor-field">
      <textarea id="tailor-instruction" rows={3} maxLength={MAX} value={instruction} placeholder={t("tailor.steer.placeholder")}
        onChange={(event) => setInstruction(event.target.value)} />
      {mic}
    </div>
    {partial && <p aria-live="polite">{partial}</p>}
    <button type="button" className="primary" disabled={busy} onClick={() => onStart({ tone, instruction: instruction.trim() })}>
      {t("tailor.steer.start", { n: sections })}
    </button>
  </section>;
}
