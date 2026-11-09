import { useEffect, useState } from "react";
import { TONES, type Tone } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { getToneExamples } from "./tailor-api.ts";

type Props = { jobId: string; tone: Tone; onTone(tone: Tone): void; onNext(): void };

/** Steering, screen 1 (SteerC1): seven tone cards, each with one of the person's own bullets in that tone. Picking only selects. */
export function ToneStep({ jobId, tone, onTone, onNext }: Props) {
  // Until the examples arrive, or if they can't be made, the cards show the fixed sentences.
  const [examples, setExamples] = useState<Partial<Record<Tone, string>>>({});
  useEffect(() => {
    let live = true;
    getToneExamples(jobId).then((reply) => { if (live && reply.examples) setExamples(reply.examples); }, () => {});
    return () => { live = false; };
  }, [jobId]);

  return <section className="tailor-steer">
    <div className="fm-steps" aria-hidden="true"><i className="is-on" /><i /></div>
    <h2 className="fm-q is-big">{t("tailor.steer.title")}</h2>
    <p className="fm-hint">{t("tailor.steer.toneHint")}</p>
    <div className="tailor-tones" role="group" aria-label={t("tailor.steer.tone")}>
      {TONES.map((value) => <button key={value} type="button" aria-pressed={tone === value}
        className={tone === value ? "tailor-tone is-on" : "tailor-tone"} onClick={() => onTone(value)}>
        <b>{tone === value && <span aria-hidden="true">✓ </span>}{t(`tailor.tone.${value}`)}</b>
        <span>“{examples[value] ?? t(`tailor.tone.example.${value}`)}”</span>
      </button>)}
      <p className="fm-fine tailor-tones-note">{t("tailor.steer.toneNote")}</p>
    </div>
    <div className="fm-foot"><button type="button" className="fm-btn" onClick={onNext}>{t("tailor.steer.next")}</button></div>
  </section>;
}
