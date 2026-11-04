import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button, useCopy } from "./ui";
import type { VoiceTypingProps } from "./VoiceTyping";

type Result = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<Result> }) => void)
    | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export function speechRecognition(): (new () => Recognition) | undefined {
  const browser = globalThis as typeof globalThis & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
/** Interim speech is a preview. Only final segments append to the user's editable answer. */
export function LiveDictation(
  props: VoiceTypingProps & { useRecording(): void },
) {
  const t = useCopy();
  const [phase, setPhase] = useState<
    "idle" | "permission" | "recording" | "stopping"
  >("idle");
  const [preview, setPreview] = useState(""),
    [retained, setRetained] = useState(""),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const recognition = useRef<Recognition | null>(null),
    generation = useRef(0),
    partial = useRef("");
  const interval = useRef<ReturnType<typeof setInterval> | undefined>(
      undefined,
    ),
    deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function state(next: typeof phase) {
    setPhase(next);
    latest.current.onBusyChange?.(next !== "idle");
  }
  function dispose() {
    generation.current++;
    clearInterval(interval.current);
    clearTimeout(deadline.current);
    const active = recognition.current;
    recognition.current = null;
    if (active) {
      active.onstart = active.onend = active.onerror = active.onresult = null;
      try {
        active.abort();
      } catch {
        /* already ended */
      }
    }
  }
  useEffect(
    () => () => {
      dispose();
      latest.current.onBusyChange?.(false);
    },
    [],
  );
  function end(message = "") {
    const unfinished = partial.current.trim();
    if (unfinished)
      setRetained((old) => [old, unfinished].filter(Boolean).join("\n"));
    partial.current = "";
    setPreview("");
    dispose();
    state("idle");
    setError(message);
  }
  function stop() {
    if (!recognition.current) return;
    state("stopping");
    clearInterval(interval.current);
    clearTimeout(deadline.current);
    deadline.current = setTimeout(() => end("timeout"), 5000);
    try {
      recognition.current.stop();
    } catch {
      end("failed");
    }
  }
  function start() {
    if (props.disabled || retained || recognition.current) return;
    const Constructor = speechRecognition();
    if (!Constructor) {
      props.useRecording();
      return;
    }
    const token = ++generation.current,
      emitted = new Set<number>();
    let retaining = false;
    partial.current = "";
    setPreview("");
    setError("");
    setSeconds(0);
    state("permission");
    try {
      const active = new Constructor();
      recognition.current = active;
      active.lang = props.language ?? "";
      active.continuous = true;
      active.interimResults = true;
      const valid = () =>
        generation.current === token && recognition.current === active;
      active.onstart = () => {
        if (!valid()) return;
        clearTimeout(deadline.current);
        state("recording");
        const started = Date.now();
        interval.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          setSeconds(Math.min(elapsed, 120));
          if (elapsed >= 120) stop();
        }, 250);
      };
      active.onresult = (event) => {
        if (!valid()) return;
        const finals: string[] = [],
          interim: string[] = [];
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i],
            text = result[0]?.transcript?.trim();
          if (!text) continue;
          if (result.isFinal) {
            if (!emitted.has(i)) {
              emitted.add(i);
              finals.push(text);
            }
          } else interim.push(text);
        }
        partial.current = interim.join(" ");
        setPreview(partial.current);
        const text = finals.join(" ");
        if (text) {
          if (
            retaining ||
            text.length > (latest.current.remainingCharacters ?? Infinity) ||
            latest.current.onTranscript(text) === false
          ) {
            setRetained((old) => [old, text].filter(Boolean).join("\n"));
            // stop() may flush further finals. Keep them in order with this
            // overflow, even if a later segment would fit on its own.
            if (!retaining) {
              retaining = true;
              stop();
            }
          }
        }
      };
      active.onerror = (event) => {
        if (valid()) end(event.error);
      };
      active.onend = () => {
        if (valid()) end();
      };
      deadline.current = setTimeout(() => end("timeout"), 15000);
      active.start();
    } catch {
      end("failed");
    }
  }
  return (
    <div className="voice-typing" data-recording={phase === "recording"}>
      <div className="voice-typing-controls">
        {phase === "idle" ? (
          <Button
            variant="ghost"
            disabled={props.disabled || !!retained}
            onClick={start}
          >
            <Mic size={16} aria-hidden="true" />
            {t("Dictează răspunsul", "Dictate answer")}
          </Button>
        ) : phase === "recording" ? (
          <Button variant="ghost" onClick={stop}>
            <Square size={14} aria-hidden="true" />
            {t("Oprește dictarea", "Stop dictation")}
          </Button>
        ) : null}
        {phase !== "idle" && (
          <Button
            variant="ghost"
            onClick={() => {
              partial.current = "";
              setPreview("");
              dispose();
              state("idle");
            }}
          >
            <X size={14} aria-hidden="true" />
            {t("Anulează", "Cancel")}
          </Button>
        )}
        <span role="status">
          {phase === "recording"
            ? `${t("Înregistrare", "Recording")} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 2:00`
            : phase === "permission"
              ? t(
                  "Se așteaptă permisiunea microfonului…",
                  "Waiting for microphone permission…",
                )
              : phase === "stopping"
                ? t("Finalizăm dictarea…", "Finishing dictation…")
                : ""}
        </span>
      </div>
      {preview && (
        <p
          className="voice-live-preview"
          role="status"
          aria-label={t("Transcriere în timp real", "Live transcript")}
        >
          {preview}
        </p>
      )}
      {error && (
        <p role="alert">
          {t(
            "Dictarea în timp real s-a oprit. Textul introdus este păstrat. Poți scrie sau folosi înregistrarea.",
            "Live dictation stopped. Your entered text is preserved. Type or use recording instead.",
          )}
        </p>
      )}
      {retained && (
        <div className="voice-typing-overflow">
          <label>
            {t("Transcriere neterminată", "Unfinished transcript")}
            <textarea
              aria-label={t("Transcriere neterminată", "Unfinished transcript")}
              value={retained}
              onChange={(e) => setRetained(e.target.value)}
              rows={3}
            />
          </label>
          <Button
            variant="ghost"
            disabled={
              props.disabled ||
              !retained.trim() ||
              retained.length > (props.remainingCharacters ?? Infinity)
            }
            onClick={() => {
              if (latest.current.onTranscript(retained) !== false)
                setRetained("");
            }}
          >
            {t("Adaugă la răspuns", "Add to answer")}
          </Button>
          <Button variant="ghost" onClick={() => setRetained("")}>
            {t("Renunță la transcriere", "Discard transcript")}
          </Button>
        </div>
      )}
      {phase === "idle" && (
        <>
          <small>
            {t(
              "Dictarea în timp real folosește serviciul de recunoaștere vocală al browserului, care poate procesa audio online. Poți edita textul.",
              "Live dictation uses your browser’s speech service, which may process audio online. You can edit the text.",
            )}
          </small>
          <Button
            variant="ghost"
            disabled={!!retained}
            onClick={props.useRecording}
          >
            {t("Folosește înregistrarea în schimb", "Use recording instead")}
          </Button>
        </>
      )}
    </div>
  );
}
