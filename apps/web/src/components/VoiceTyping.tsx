import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button, useCopy } from "./ui";
import "./VoiceTyping.css";

export interface VoiceTypingProps {
  language?: string;
  transcribe(audio: Blob, signal: AbortSignal): Promise<string>;
  onTranscript(text: string): void | boolean;
  disabled?: boolean;
  remainingCharacters?: number;
  onBusyChange?(busy: boolean): void;
}
const maxBytes = 4 * 1024 * 1024;
const maxSeconds = 120;
const formats = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Mount with a key for the current question so old microphone/transcript work is discarded. */
export function VoiceTyping(props: VoiceTypingProps) {
  return <RecordedVoiceTyping {...props} />;
}
function RecordedVoiceTyping({
  transcribe,
  onTranscript,
  disabled,
  onBusyChange,
  remainingCharacters,
}: VoiceTypingProps) {
  const t = useCopy();
  const [phase, setPhase] = useState<
    "idle" | "permission" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [retainedText, setRetainedText] = useState("");
  const lifetime = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const callbacks = useRef({
    transcribe,
    onTranscript,
    onBusyChange,
    remainingCharacters,
  });
  callbacks.current = {
    transcribe,
    onTranscript,
    onBusyChange,
    remainingCharacters,
  };
  const supported =
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  function updatePhase(next: typeof phase) {
    busy.current = next !== "idle";
    setPhase(next);
    callbacks.current.onBusyChange?.(busy.current);
  }
  function releaseMicrophone() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  function discard() {
    lifetime.current++;
    const current = recorder.current;
    recorder.current = null;
    if (current) {
      current.ondataavailable = null;
      current.onstop = null;
      current.onerror = null;
      if (current.state !== "inactive") current.stop();
    }
    releaseMicrophone();
    request.current?.abort();
    request.current = null;
  }
  useEffect(
    () => () => {
      discard();
      if (busy.current) callbacks.current.onBusyChange?.(false);
    },
    [],
  );
  async function start() {
    if (disabled || retainedText || busy.current || !supported) return;
    setError("");
    setSeconds(0);
    updatePhase("permission");
    const generation = ++lifetime.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== lifetime.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = formats.find((format) =>
        MediaRecorder.isTypeSupported(format),
      );
      if (!mimeType) throw Error("VOICE_FORMAT");
      const capture = new MediaRecorder(media, {
        mimeType,
        audioBitsPerSecond: 64000,
      });
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      capture.ondataavailable = (event) => {
        if (generation !== lifetime.current || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > maxBytes) {
          discard();
          updatePhase("idle");
          setError("VOICE_SIZE");
          return;
        }
        chunks.push(event.data);
      };
      capture.onerror = () => {
        if (generation !== lifetime.current) return;
        discard();
        updatePhase("idle");
        setError("VOICE_RECORDING_FAILED");
      };
      capture.onstop = () => {
        if (generation !== lifetime.current) return;
        releaseMicrophone();
        recorder.current = null;
        const audio = new Blob(chunks, { type: capture.mimeType || mimeType });
        if (!audio.size) {
          updatePhase("idle");
          setError("VOICE_NO_SPEECH");
          return;
        }
        const controller = new AbortController();
        request.current = controller;
        updatePhase("transcribing");
        void (async () =>
          callbacks.current.transcribe(audio, controller.signal))()
          .then((text) => {
            if (generation === lifetime.current && !controller.signal.aborted) {
              if (
                text.length >
                (callbacks.current.remainingCharacters ?? Infinity)
              )
                setRetainedText(text);
              else if (callbacks.current.onTranscript(text) === false)
                setRetainedText(text);
            }
          })
          .catch((cause) => {
            if (generation !== lifetime.current || controller.signal.aborted)
              return;
            const code =
              cause && typeof cause === "object" && "code" in cause
                ? String(cause.code)
                : "VOICE_OUTCOME_UNKNOWN";
            setError(code);
          })
          .finally(() => {
            if (generation === lifetime.current) {
              request.current = null;
              updatePhase("idle");
            }
          });
      };
      capture.start(1000);
      updatePhase("recording");
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, maxSeconds));
        if (elapsed >= maxSeconds && capture.state === "recording")
          capture.stop();
      }, 250);
    } catch (cause) {
      if (generation !== lifetime.current) return;
      discard();
      updatePhase("idle");
      setError(
        cause instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(cause.name)
          ? "VOICE_PERMISSION"
          : "VOICE_RECORDING_FAILED",
      );
    }
  }
  const message =
    error === "VOICE_PERMISSION"
      ? t(
          "Permite accesul la microfon în browser sau scrie răspunsul.",
          "Allow microphone access in your browser or type your answer.",
        )
      : [
            "AI_DISABLED",
            "AI_UNCONFIGURED",
            "VOICE_ACCOUNTING_UNAVAILABLE",
          ].includes(error)
        ? t(
            "Transcrierea vocală nu este disponibilă acum. Poți scrie răspunsul.",
            "Voice typing is unavailable right now. You can type your answer.",
          )
        : ["VOICE_OUTCOME_UNKNOWN", "VOICE_ALREADY_REQUESTED"].includes(error)
          ? t(
              "Nu am putut confirma transcrierea. Nu am retrimis înregistrarea. Poți scrie răspunsul sau începe o înregistrare nouă.",
              "We could not confirm the transcription. The recording was not resent. You can type your answer or start a new recording.",
            )
          : error === "VOICE_NO_SPEECH"
            ? t(
                "Nu am detectat vorbire. Încearcă o înregistrare nouă sau scrie răspunsul.",
                "No speech was detected. Start a new recording or type your answer.",
              )
            : error === "VOICE_SIZE"
              ? t(
                  "Înregistrarea este prea mare. Folosește un răspuns mai scurt.",
                  "The recording is too large. Try a shorter answer.",
                )
              : t(
                  "Înregistrarea nu a putut fi transcrisă. Poți scrie răspunsul.",
                  "The recording could not be transcribed. You can type your answer.",
                );
  return (
    <div className="voice-typing" data-recording={phase === "recording"}>
      <div className="voice-typing-controls">
        {phase === "idle" ? (
          <Button
            variant="ghost"
            disabled={disabled || !supported || !!retainedText}
            onClick={() => void start()}
          >
            <Mic size={16} aria-hidden="true" />
            {t("Dictează răspunsul", "Dictate answer")}
          </Button>
        ) : phase === "recording" ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (recorder.current?.state === "recording")
                recorder.current.stop();
            }}
          >
            <Square size={14} aria-hidden="true" />
            {t("Oprește și transcrie", "Stop and transcribe")}
          </Button>
        ) : null}
        {phase !== "idle" && (
          <Button
            variant="ghost"
            onClick={() => {
              discard();
              updatePhase("idle");
              setError("");
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
              : phase === "transcribing"
                ? t("Se transcrie…", "Transcribing…")
                : ""}
        </span>
      </div>
      {phase === "idle" && !error && (
        <small>
          {supported
            ? t(
                "Până la 2 minute. Audio trimis la OpenAI la oprire; poți edita textul.",
                "Up to 2 minutes. Audio is sent to OpenAI when you stop; you can edit the text.",
              )
            : t(
                "Microfonul nu este disponibil în acest browser. Poți scrie răspunsul.",
                "The microphone is unavailable in this browser. You can type your answer.",
              )}
        </small>
      )}
      {error && <p role="alert">{message}</p>}
      {retainedText && (
        <div className="voice-typing-overflow">
          <p role="status">
            {t(
              "Răspunsul este prea lung. Scurtează răspunsul sau copiază detaliile pe care vrei să le păstrezi.",
              "This answer is too long. Shorten your answer or copy the details you want to keep.",
            )}
          </p>
          <textarea
            onChange={(event) => setRetainedText(event.target.value)}
            value={retainedText}
            rows={4}
            aria-label={t("Transcriere completă", "Full transcript")}
          />
          <div className="voice-typing-controls">
            <Button
              variant="ghost"
              disabled={
                disabled ||
                retainedText.length > (remainingCharacters ?? Infinity)
              }
              onClick={() => {
                if (callbacks.current.onTranscript(retainedText) !== false)
                  setRetainedText("");
              }}
            >
              {t("Adaugă la răspuns", "Add to answer")}
            </Button>
            <Button variant="ghost" onClick={() => setRetainedText("")}>
              {t("Renunță la transcriere", "Discard transcript")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
