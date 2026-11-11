import { useEffect, useRef } from "react";
import { VOICE, type Locale, type Note, type Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { useVoice } from "./useVoice.ts";
import { MicButton, micAvailable, VoiceStatus } from "./VoiceControls.tsx";

export type Via = Note["via"][number];

type Props = {
  question: Question;
  value: string;
  via: Via[];
  onChange(value: string, via: Via[]): void;
  /** The CV's language, so screen readers read the answer in it. */
  locale?: Locale;
  maxSeconds?: number;
  /** Names the text box for screen readers, instead of "Your answer". */
  label?: string;
  /** Replaces the default "Pick, type or speak…" placeholder. */
  placeholder?: string;
  /** No option chips (the brain dump): just the text box and the mic. */
  plain?: boolean;
  /** While the answer is being sent: nothing can be added, since it would not be part of what was sent. */
  readOnly?: boolean;
  /** Told when voice starts or stops being busy (asking for the mic, recording, finishing the last words). */
  onBusyChange?(busy: boolean): void;
};

const SEP = ", ";

/** Where `option` sits in `value` as a whole ", "-bounded piece, or -1. Options may contain ", " themselves. */
function findPiece(value: string, option: string): number {
  for (let i = value.indexOf(option); i >= 0; i = value.indexOf(option, i + 1)) {
    const end = i + option.length;
    const startOk = i === 0 || value.slice(i - SEP.length, i) === SEP;
    const endOk = end === value.length || value.startsWith(SEP, end);
    if (startOk && endOk) return i;
  }
  return -1;
}

const isPicked = (value: string, option: string) => option !== "" && findPiece(value, option) >= 0;

/** Adds the option as its own ", " piece, or removes exactly that piece and nothing else. */
function togglePick(value: string, option: string): string {
  const i = findPiece(value, option);
  if (i >= 0) {
    const end = i + option.length;
    if (value.startsWith(SEP, end)) return value.slice(0, i) + value.slice(end + SEP.length);
    return value.slice(0, Math.max(0, i - SEP.length)) + value.slice(end);
  }
  const base = value.replace(/[\s,]+$/, "");
  return base ? base + SEP + option : option;
}

/** Spoken words go after a picked option as a new ", " piece, otherwise after a space. */
function appendSpoken(value: string, text: string, options: string[]): string {
  const base = value.replace(/\s+$/, "");
  if (!base) return text;
  const afterOption = options.some((o) => o && (base === o || base.endsWith(SEP + o)));
  return base + (afterOption ? SEP : " ") + text;
}

const addVia = (via: Via[], how: Via): Via[] => (via.includes(how) ? via : [...via, how]);

/** One question's answer: pick option chips, type, or speak. It never saves on its own. */
export function AnswerBox({ question, value, via, onChange, locale = "en", maxSeconds = VOICE.maxSeconds, label, placeholder, plain = false, readOnly = false, onBusyChange }: Props) {
  const voice = useVoice({ locale, maxSeconds });
  const field = useRef<HTMLTextAreaElement>(null);
  // spoken pieces can arrive faster than re-renders, so they build on the latest text
  const latest = useRef({ value, via, onChange, options: question.options });
  useEffect(() => {
    latest.current = { value, via, onChange, options: question.options };
  });
  const { onFinal } = voice;
  useEffect(() => {
    onFinal((text) => {
      const cur = latest.current;
      const next = { ...cur, value: appendSpoken(cur.value, text, cur.options), via: addVia(cur.via, "voice") };
      latest.current = next;
      cur.onChange(next.value, next.via);
    });
  }, [onFinal]);

  const { state } = voice;
  const recording = state === "recording";
  const countingDown = state === "countdown";
  const busy = state === "asking" || countingDown || recording || state === "stopping";
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const micShown = !readOnly && micAvailable(voice);
  const message =
    state === "denied"
      ? t("enrich.voice.denied")
      : state === "limit"
        ? t("enrich.voice.limit")
        : state === "idle" && voice.interrupted
          ? t("enrich.voice.interrupted")
          : null;

  return (
    <div className={plain ? "answer-box is-plain" : "answer-box"}>
      {!plain && question.options.length > 0 && <div className="answer-opts" role="group" aria-label={t("enrich.answer.options")}>
        {question.options.map((o, i) => (
          <button
            key={`${i}:${o}`}
            type="button"
            className="answer-opt"
            aria-pressed={isPicked(value, o)}
            onClick={() => onChange(togglePick(value, o), addVia(via, "pick"))}
          >
            {o}
          </button>
        ))}
        <button type="button" className="answer-opt is-other" onClick={() => field.current?.focus()}>
          {t("enrich.answer.other")}
        </button>
      </div>}
      <div className={micShown ? "answer-field has-mic" : "answer-field"}>
        <textarea
          ref={field}
          lang={locale}
          aria-label={label ?? t("enrich.answer.label")}
          placeholder={placeholder ?? t("enrich.answer.placeholder")}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value, addVia(via, "type"))}
        />
        {micShown && <MicButton voice={voice} startLabel={t("enrich.voice.start")} stopLabel={t("enrich.voice.stop")} />}
      </div>
      <VoiceStatus voice={voice} locale={locale} maxSeconds={maxSeconds} showWords={micShown} />
      {message && (
        <p className="answer-voice-msg" role="status">
          {message}
        </p>
      )}
      {question.options.length > 0 && <p className="fine">{t("enrich.answer.optionsHint")}</p>}
    </div>
  );
}
