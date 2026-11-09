import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { STEERING_DRAWS, STEERING_FITS, type Question, type Steering, type Tone } from "@resumora/shared";
import { AnswerBox } from "../cv/enrich/AnswerBox.tsx";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { MicButton, micAvailable, VoiceStatus } from "../cv/enrich/VoiceControls.tsx";
import { t } from "../i18n/t.ts";
import { ToneStep } from "./ToneStep.tsx";

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

export type SteeringRole = { id: string; title: string; company: string };
type Props = { jobId: string; roles: SteeringRole[]; busy: boolean; onStart(steering: Steering): void };

// The free-text box is the enrichment answer box with no option chips.
const FREE_TEXT: Question = { bulletId: "steering", text: "", options: [], kind: "detail" };
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

/** Steering (SteerC1, SteerC2): the tone, then the fixed optional questions. Nothing is sent until Start tailoring. */
export function SteeringStep({ jobId, roles, busy, onStart }: Props) {
  const [screen, setScreen] = useState<"tone" | "questions">("tone");
  const [tone, setTone] = useState<Tone>("neutral");
  const [draws, setDraws] = useState<NonNullable<Steering["draws"]>>([]);
  const [fit, setFit] = useState<Steering["fit"]>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [via, setVia] = useState<Parameters<typeof AnswerBox>[0]["via"]>([]);

  if (screen === "tone") return <ToneStep jobId={jobId} tone={tone} onTone={setTone} onNext={() => setScreen("questions")} />;

  const chip = (key: string, label: string, on: boolean, pick: () => void) =>
    <button key={key} type="button" className="answer-opt" aria-pressed={on} onClick={pick}>{label}</button>;
  const start = () => onStart({
    tone, draws, fit, focusRoleIds: roles.filter((role) => focus.includes(role.id)).map((role) => role.id),
    ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
  });

  return <section className="tailor-steer">
    <div className="fm-steps" aria-hidden="true"><i className="is-done" /><i className="is-on" /></div>
    <h2 className="fm-q">{t("tailor.steer.questions")} <span className="tailor-steer-aside">{t("tailor.steer.optional")}</span></h2>
    <div className="tailor-steer-qs">
      <div>
        <p className="tailor-steer-q" id="steer-draws">{t("tailor.steer.draws")} <span>{t("tailor.steer.pickAny")}</span></p>
        <div className="answer-opts" role="group" aria-labelledby="steer-draws">
          {STEERING_DRAWS.map((draw) => chip(draw, t(`tailor.steer.draw.${draw}`), draws.includes(draw), () => setDraws(toggle(draws, draw))))}
        </div>
      </div>
      <div>
        <p className="tailor-steer-q" id="steer-fit">{t("tailor.steer.fit")} <span>{t("tailor.steer.pickOne")}</span></p>
        <div className="answer-opts" role="group" aria-labelledby="steer-fit">
          {STEERING_FITS.map((value) => chip(value, t(`tailor.steer.fit.${value}`), fit === value, () => setFit(fit === value ? null : value)))}
        </div>
      </div>
      {roles.length > 0 && <div>
        <p className="tailor-steer-q" id="steer-focus">{t("tailor.steer.focus")} <span>{t("tailor.steer.yourRoles")}</span></p>
        <div className="answer-opts" role="group" aria-label={t("tailor.steer.focus")}>
          {roles.map((role) => chip(role.id, [role.title, role.company].filter(Boolean).join(" · "), focus.includes(role.id),
            () => setFocus(toggle(focus, role.id))))}
        </div>
      </div>}
      <div>
        <p className="tailor-steer-q">{t("tailor.steer.instruction")}</p>
        <AnswerBox question={FREE_TEXT} value={instruction} via={via} plain readOnly={busy} placeholder={t("tailor.steer.placeholder")}
          onChange={(value, how) => { setInstruction(value.slice(0, MAX)); setVia(how); }} />
      </div>
    </div>
    <div className="fm-foot">
      <button type="button" className="fm-ghost" onClick={() => setScreen("tone")}>{t("tailor.steer.backTone", { tone: t(`tailor.tone.${tone}`) })}</button>
      <button type="button" className="fm-btn" disabled={busy} onClick={start}>{t("tailor.steer.start")}</button>
    </div>
  </section>;
}
