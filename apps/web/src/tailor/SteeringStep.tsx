import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tone } from "@resumora/shared";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { MicButton, micAvailable, VoiceStatus } from "../cv/enrich/VoiceControls.tsx";
import { t } from "../i18n/t.ts";

const TONES: Tone[] = ["formal", "neutral", "confident"];
const MAX = 500;

/**
 * Speech appended to a text field, in the app's one recording look: `mic` goes in the field's corner
 * (hidden when voice isn't available), `status` under the field (3-2-1, the recording bar, the words so far).
 */
export function useDictation(append: (words: string) => void) {
  const voice = useVoice({ locale: "en" });
  const latest = useRef(append);
  useLayoutEffect(() => { latest.current = append; });
  useEffect(() => { voice.onFinal((words) => latest.current(words)); }, [voice.onFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const mic = micAvailable(voice) && <MicButton voice={voice} startLabel={t("tailor.voice.start")} stopLabel={t("tailor.voice.stop")} />;
  return { mic, status: <VoiceStatus voice={voice} /> };
}

type Props = { sections: number; busy: boolean; onStart(steering: { tone: Tone; instruction: string }): void };

export function SteeringStep({ sections, busy, onStart }: Props) {
  const [tone, setTone] = useState<Tone>("neutral");
  const [instruction, setInstruction] = useState("");
  const { mic, status } = useDictation((words) => setInstruction((text) => [text.trimEnd(), words].filter(Boolean).join(" ").slice(0, MAX)));
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
    {status}
    <button type="button" className="primary" disabled={busy} onClick={() => onStart({ tone, instruction: instruction.trim() })}>
      {t("tailor.steer.start", { n: sections })}
    </button>
  </section>;
}
