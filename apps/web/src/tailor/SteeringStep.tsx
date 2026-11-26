import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Question, Steering, Tone } from "@resumora/shared";
import { AnswerBox } from "../cv/enrich/AnswerBox.tsx";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { MicButton, micAvailable, VoiceStatus } from "../cv/enrich/VoiceControls.tsx";
import { t } from "../i18n/t.ts";
import { ToneCards } from "./ToneStep.tsx";

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

type Props = {
  jobId: string; busy: boolean; onStart(steering: Steering): void;
  /** The run's stored choices: the screen starts from them, and the answers it no longer asks are kept as they are. */
  initial?: Steering; startLabel?: string; onCancel?(): void;
};

// The free-text box is the enrichment answer box with no option chips.
const FREE_TEXT: Question = { bulletId: "steering", text: "", options: [], kind: "detail" };

/** Adjust, on a started run: the tone and "Anything else we should know?", on one screen. */
export function SteeringStep({ jobId, busy, onStart, initial, startLabel, onCancel }: Props) {
  const [tone, setTone] = useState<Tone>(initial?.tone ?? "neutral");
  const [instruction, setInstruction] = useState(initial?.instruction ?? "");
  const [via, setVia] = useState<Parameters<typeof AnswerBox>[0]["via"]>([]);

  const start = () => onStart({
    tone, draws: initial?.draws ?? [], fit: initial?.fit ?? null, focusRoleIds: initial?.focusRoleIds ?? [],
    ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
  });

  return <section className="tailor-steer">
    <ToneCards jobId={jobId} tone={tone} onTone={setTone} />
    <div className="tailor-steer-qs">
      <div>
        <p className="tailor-steer-q">{t("tailor.steer.instruction")}</p>
        <AnswerBox question={FREE_TEXT} value={instruction} via={via} plain readOnly={busy} placeholder={t("tailor.steer.placeholder")}
          onChange={(value, how) => { setInstruction(value.slice(0, MAX)); setVia(how); }} />
      </div>
    </div>
    <div className="tailor-foot">
      {onCancel ? <button type="button" className="ui-btn ui-btn--quiet" onClick={onCancel}>{t("tailor.back.resume")}</button> : <span />}
      <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={start}>{startLabel ?? t("tailor.steer.save")}</button>
    </div>
  </section>;
}

/** Changing the steering of a started run: it redoes every step, so it asks first. */
export function SteerConfirm({ busy, onCancel, onRedo }: { busy: boolean; onCancel(): void; onRedo(): void }) {
  return <section className="ui-sheet tailor-card" role="alertdialog" aria-labelledby="steer-confirm" aria-describedby="steer-confirm-text">
    <h2 className="ui-heading ui-heading--lg" id="steer-confirm">{t("tailor.steer.confirm.title")}</h2>
    <p id="steer-confirm-text">{t("tailor.steer.confirm.text")}</p>
    <div className="tailor-foot">
      <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onCancel}>{t("tailor.steer.confirm.cancel")}</button>
      <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={onRedo}>{t("tailor.steer.confirm.redo")}</button>
    </div>
  </section>;
}
