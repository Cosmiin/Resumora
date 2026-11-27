import { useEffect, useRef } from "react";
import { BLANK, VOICE, hasBlank, type Locale, type Note, type Question } from "@resumora/shared";
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

/*
 * Blank options (score/12), worked on whole pieces: the answer is split at commas and each piece is compared with its
 * spaces trimmed, so stray spaces, new lines or a trailing ", " never hide a picked option. A blank option holding a
 * comma itself is not supported (the prompt's examples have none).
 */
type Piece = { text: string; start: number; end: number; rawStart: number; rawEnd: number };

/** The answer's comma-separated pieces: trimmed text, its place, and the place of the raw piece around it. */
function pieces(value: string): Piece[] {
  const out: Piece[] = [];
  let rawStart = 0;
  for (let k = 0; k <= value.length; k++) {
    if (k < value.length && value[k] !== ",") continue;
    const raw = value.slice(rawStart, k);
    const text = raw.trim();
    const lead = raw.length - raw.trimStart().length;
    if (text) out.push({ text, start: rawStart + lead, end: rawStart + lead + text.length, rawStart, rawEnd: k });
    rawStart = k + 1;
  }
  return out;
}

/** A filled blank: a short amount with a digit in it ("10–25", "18", "Under 10"), never a sentence someone typed. */
const isAmount = (fill: string) => fill.trim() !== "" && fill.length <= 20 && /\d/.test(fill) && !fill.includes(BLANK);

/** The piece holding a blank option: unfilled (the option itself) or filled with an amount. */
function blankPiece(value: string, option: string): { piece: Piece; filled: boolean } | null {
  const all = pieces(value);
  const open = all.find((p) => p.text === option);
  if (open) return { piece: open, filled: false };
  const [pre = "", post = ""] = option.split(BLANK);
  const filled = all.find((p) => p.text.length > pre.length + post.length && p.text.startsWith(pre) && p.text.endsWith(post)
    && isAmount(p.text.slice(pre.length, p.text.length - post.length)));
  return filled ? { piece: filled, filled: true } : null;
}

/** The answer without that piece and one comma next to it. */
function removePiece(value: string, p: Piece): string {
  const out = value[p.rawEnd] === ","
    ? value.slice(0, p.rawStart) + value.slice(p.rawEnd + 1)
    : value.slice(0, Math.max(0, p.rawStart - 1)) + value.slice(p.rawEnd);
  return out.replace(/^[\s,]+/, "");
}

/** The piece that is a picked blank option still waiting for its amount, if any. */
function openBlank(value: string, options: readonly string[]): { option: string; piece: Piece } | null {
  for (const p of pieces(value)) {
    const option = options.find((o) => hasBlank(o) && o === p.text);
    if (option) return { option, piece: p };
  }
  return null;
}

/** Picks or unpicks an option; a blank option is unpicked whether its blank is filled or not. */
function toggleOption(value: string, option: string): string {
  if (!hasBlank(option)) return togglePick(value, option);
  const found = blankPiece(value, option);
  return found ? removePiece(value, found.piece) : togglePick(value, option);
}

/** Whether the option's chip shows as picked. */
const optionPicked = (value: string, option: string) => (hasBlank(option) ? blankPiece(value, option) !== null : isPicked(value, option));

/**
 * The answer as it should be saved: every piece that is still a blank option with its blank unfilled is left out
 * (score/12). A "…" the person typed themselves stays.
 */
export function withoutOpenBlanks(value: string, options: readonly string[]): string {
  let out = value;
  for (let open = openBlank(out, options); open; open = openBlank(out, options)) out = removePiece(out, open.piece);
  return out.replace(/^[\s,]+|[\s,]+$/g, "");
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
  // A picked option whose blank is still "…": its amounts are offered until it is filled (score/12).
  // Filling replaces only that piece's text, so whatever was typed around it stays.
  const amounts = question.amounts ?? [];
  const open = amounts.length > 0 ? openBlank(value, question.options) : null;
  const fill = (amount: string) => {
    if (!open) return;
    const { option, piece } = open;
    onChange(value.slice(0, piece.start) + option.replace(BLANK, amount) + value.slice(piece.end), addVia(via, "pick"));
  };
  const typeIt = () => {
    const box = field.current;
    if (!box || !open) return;
    const at = open.piece.start + open.option.indexOf(BLANK);
    box.focus();
    box.setSelectionRange(at, at + BLANK.length);
  };

  return (
    <div className={plain ? "answer-box is-plain" : "answer-box"}>
      {/* The rule for the options, read before them (owner, 27 Nov 2026: it was small grey text under the box). */}
      {question.options.length > 0 && <p className="answer-rule">{t("enrich.answer.optionsHint")}</p>}
      {!plain && question.options.length > 0 && <div className="answer-opts" role="group" aria-label={t("enrich.answer.options")}>
        {question.options.map((o, i) => (
          <button
            key={`${i}:${o}`}
            type="button"
            className="answer-opt"
            aria-pressed={optionPicked(value, o)}
            onClick={() => onChange(toggleOption(value, o), addVia(via, "pick"))}
          >
            {o}
          </button>
        ))}
        <button type="button" className="answer-opt is-other" onClick={() => field.current?.focus()}>
          {t("enrich.answer.other")}
        </button>
      </div>}
      {!plain && open && (
        <div className="answer-amounts" role="group" aria-label={t("enrich.answer.amount")}>
          <span className="answer-amounts-label">{t("enrich.answer.amount")}</span>
          {amounts.map((a, i) => (
            <button key={`${i}:${a}`} type="button" className="answer-opt" onClick={() => fill(a)}>{a}</button>
          ))}
          <button type="button" className="answer-opt is-other" onClick={typeIt}>{t("enrich.answer.typeIt")}</button>
        </div>
      )}
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
    </div>
  );
}
