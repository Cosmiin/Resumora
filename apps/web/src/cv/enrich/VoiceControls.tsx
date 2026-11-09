import { useSyncExternalStore, type MouseEvent } from "react";
import { VOICE, type Locale } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { useVoice } from "./useVoice.ts";

/** The app's one recording look (first built for enrichment): the mic button, 3-2-1, "Start talking", the bar. */
type Voice = ReturnType<typeof useVoice>;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
function onMotionChange(listener: () => void) {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const MicIcon = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="5.5" y="1" width="5" height="9" rx="2.5" />
    <path d="M3 7.5a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 12.5V15" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** Whether the mic can be offered: not when blocked, missing or out of today's voice answers. */
export const micAvailable = (voice: Voice) => voice.state !== "denied" && voice.state !== "unavailable" && voice.state !== "limit";

type MicProps = {
  voice: Voice;
  startLabel: string;
  stopLabel: string;
  /** Runs before the mic starts or stops (e.g. keep the text box focused). */
  onPress?(): void;
  onMouseDown?(event: MouseEvent<HTMLButtonElement>): void;
};

/** The round mic button; it sits in the bottom corner of a `position: relative` text box wrapper. */
export function MicButton({ voice, startLabel, stopLabel, onPress, onMouseDown }: MicProps) {
  const { state } = voice;
  const recording = state === "recording";
  const countingDown = state === "countdown";
  return (
    <button
      type="button"
      className="mic"
      aria-pressed={recording}
      aria-label={recording || countingDown ? stopLabel : startLabel}
      aria-busy={state === "asking" || state === "stopping"}
      disabled={state === "asking" || state === "stopping"}
      onMouseDown={onMouseDown}
      onClick={() => {
        onPress?.();
        if (recording || countingDown) voice.stop();
        else if (state === "idle") voice.start();
      }}
    >
      {MicIcon}
    </button>
  );
}

/** Under the text box: 3-2-1, "Start talking" and the recording bar, "finishing", and the words so far. */
export function VoiceStatus({ voice, locale = "en", maxSeconds = VOICE.maxSeconds, showWords = micAvailable(voice) }:
  { voice: Voice; locale?: Locale; maxSeconds?: number; /** The live words area; by default only while the mic can be used. */ showWords?: boolean }) {
  const reduceMotion = useSyncExternalStore(onMotionChange, reducedMotion);
  const { state } = voice;
  const left = maxSeconds - voice.seconds;
  return (
    <>
      {state === "countdown" && (
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
      {state === "recording" && (
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
      {showWords && (
        <div className="answer-live" aria-live="polite" lang={locale}>
          {voice.partial && <span className="answer-partial">
            {voice.partialWords.map((word, i) => (
              <span key={word.key} className={reduceMotion ? undefined : "voice-word-new"}>{i > 0 ? " " : ""}{word.text}</span>
            ))}
          </span>}
        </div>
      )}
    </>
  );
}
