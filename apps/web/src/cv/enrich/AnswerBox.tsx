import { useEffect, useRef, useSyncExternalStore } from "react";
import { VOICE, type Locale, type Note, type Question } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { useVoice } from "./useVoice.ts";

export type Via = Note["via"][number];

type Props = {
  question: Question;
  value: string;
  via: Via[];
  onChange(value: string, via: Via[]): void;
  /** The CV's language, so screen readers read the answer in it. */
  locale?: Locale;
  maxSeconds?: number;
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
const NOTICE_KEY = "resumora.voiceNoticeSeen";

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

// The privacy notice shows until the first recording, in every box on the page at once.
let seenThisPage = false;
const noticeListeners = new Set<() => void>();

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return seenThisPage; // private mode or blocked storage: remember for this page only
  }
}

function markNoticeSeen() {
  seenThisPage = true;
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // blocked storage: `seenThisPage` covers this page
  }
  noticeListeners.forEach((l) => l());
}

function onNoticeChange(listener: () => void) {
  noticeListeners.add(listener);
  return () => void noticeListeners.delete(listener);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const MicIcon = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="5.5" y="1" width="5" height="9" rx="2.5" />
    <path d="M3 7.5a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 12.5V15" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** One question's answer: pick option chips, type, or speak. It never saves on its own. */
export function AnswerBox({ question, value, via, onChange, locale = "en", maxSeconds = VOICE.maxSeconds, placeholder, plain = false, readOnly = false, onBusyChange }: Props) {
  const voice = useVoice({ locale, maxSeconds });
  const field = useRef<HTMLTextAreaElement>(null);
  const seen = useSyncExternalStore(onNoticeChange, noticeSeen);
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
  const micShown = !readOnly && state !== "denied" && state !== "unavailable" && state !== "limit";
  const message =
    state === "denied"
      ? t("enrich.voice.denied")
      : state === "limit"
        ? t("enrich.voice.limit")
        : state === "idle" && voice.interrupted
          ? t("enrich.voice.interrupted")
          : null;
  const left = maxSeconds - voice.seconds;

  const onMic = () => {
    if (recording || countingDown) return voice.stop();
    if (state !== "idle") return;
    if (!seen) markNoticeSeen();
    voice.start();
  };

  return (
    <div className={plain ? "answer-box is-plain" : "answer-box"}>
      {!plain && <div className="answer-opts" role="group" aria-label={t("enrich.answer.options")}>
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
          aria-label={t("enrich.answer.label")}
          placeholder={placeholder ?? t("enrich.answer.placeholder")}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value, addVia(via, "type"))}
        />
        {micShown && (
          <button
            type="button"
            className="mic"
            aria-pressed={recording}
            aria-label={t(recording || countingDown ? "enrich.voice.stop" : "enrich.voice.start")}
            aria-busy={state === "asking" || state === "stopping"}
            disabled={state === "asking" || state === "stopping"}
            onClick={onMic}
          >
            {MicIcon}
          </button>
        )}
      </div>
      {countingDown && (
        <div className="voice-cue">
          {/* The live region stays put (so it is announced); the number inside is keyed so each 3 / 2 / 1 pops in. */}
          <div className="voice-count" data-testid="voice-countdown" aria-live="polite">
            <span key={voice.count}>{voice.count}</span>
          </div>
          <p className="voice-ready">
            {voice.count === 1 && voice.connecting ? t("enrich.focus.voice.gettingReady") : t("enrich.focus.voice.getReady")}
          </p>
        </div>
      )}
      {recording && (
        <div className="answer-rec">
          {voice.seconds < 2 && (
            <span className="voice-go">
              <span className="voice-dot" aria-hidden="true" />
              {t("enrich.focus.voice.go")}
            </span>
          )}
          <div className="voice-bar">
            <span className="voice-wave" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${(i * 0.37) % 1}s` }} />
              ))}
            </span>
            <span className="voice-time">
              {t("enrich.voice.listening", { time: clock(voice.seconds), max: clock(maxSeconds) })}
            </span>
            {left <= 10 && <span className="answer-countdown">{t("enrich.voice.endsIn", { n: left })}</span>}
          </div>
        </div>
      )}
      {state === "stopping" && <span className="answer-rec is-finishing">{t("enrich.voice.finishing")}</span>}
      {micShown && (
        <div className="answer-live" aria-live="polite" lang={locale}>
          {voice.partial && <span className="answer-partial">{voice.partial}</span>}
        </div>
      )}
      {message && (
        <p className="answer-voice-msg" role="status">
          {message}
        </p>
      )}
      {micShown && !seen && <p className="voice-note">{t("enrich.voice.notice")}</p>}
      {question.options.length > 0 && <p className="fine">{t("enrich.answer.optionsHint")}</p>}
    </div>
  );
}
