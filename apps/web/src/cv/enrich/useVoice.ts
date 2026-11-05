import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE, type Locale } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import { createVoiceSession } from "./enrich-api.ts";
import { startCapture } from "./mic.ts";
import { openTranscription, type TranscriptEvent, type Transport } from "./realtime.ts";

export type VoiceState = "idle" | "asking" | "recording" | "stopping" | "denied" | "unavailable" | "limit";

/** After stop, how long to wait for the last words before closing. */
const STOP_WAIT_MS = 1500;

/** One recording: everything that has to be closed when it ends. */
type Live = {
  stream?: MediaStream;
  stopCapture?: () => void;
  transport?: Transport;
  tick?: ReturnType<typeof setInterval>;
  wait?: ReturnType<typeof setTimeout>;
  seconds: number;
  stopping: boolean;
  /** After stop: our commit hasn't been answered yet. */
  awaitingCommit: boolean;
  /** Pieces of speech still being transcribed, with their words so far. */
  partials: Map<string, string>;
};

const supported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== "undefined";

function stopMic(l: Live) {
  clearInterval(l.tick);
  l.stopCapture?.();
  l.stopCapture = undefined;
  l.stream?.getTracks().forEach((track) => track.stop());
}

function closeAll(l: Live) {
  stopMic(l);
  clearTimeout(l.wait);
  l.transport?.close();
}

/**
 * Live voice answers: the microphone goes straight to OpenAI on a short-lived key and the words come
 * back as they are spoken. `partial` holds words still being worked out; finished pieces go to `onFinal`.
 * The language comes from the saved CV on the server; `locale` is the same CV's language.
 */
export function useVoice(_opts: { locale: Locale }) {
  const [state, setState] = useState<VoiceState>(() => (supported() ? "idle" : "unavailable"));
  const [partial, setPartial] = useState("");
  const [seconds, setSeconds] = useState(0);
  const live = useRef<Live | null>(null);
  const finalCb = useRef<(text: string) => void>(() => {});

  /** Ends the current recording and closes the microphone and the connection. */
  const end = useCallback((next: VoiceState) => {
    const l = live.current;
    live.current = null;
    if (l) closeAll(l);
    setPartial("");
    setState(next);
  }, []);

  const stop = useCallback(() => {
    const l = live.current;
    if (!l || l.stopping) return;
    if (!l.transport || !l.stopCapture) return end("idle"); // still asking
    l.stopping = true;
    l.awaitingCommit = true;
    stopMic(l); // sends the last audio before the commit
    l.transport.commit();
    setState("stopping");
    l.wait = setTimeout(() => live.current === l && end("idle"), STOP_WAIT_MS);
  }, [end]);

  const onEvent = useCallback(
    (l: Live, e: TranscriptEvent) => {
      if (live.current !== l) return;
      const show = () => setPartial([...l.partials.values()].map((s) => s.trim()).filter(Boolean).join(" "));
      const done = () => l.stopping && !l.awaitingCommit && l.partials.size === 0;
      switch (e.type) {
        case "partial":
          l.partials.set(e.itemId, (l.partials.get(e.itemId) ?? "") + e.text);
          return show();
        case "committed":
          if (!l.partials.has(e.itemId)) l.partials.set(e.itemId, "");
          if (l.stopping) l.awaitingCommit = false;
          return;
        case "final":
        case "failed": {
          l.partials.delete(e.itemId);
          show();
          const text = e.type === "final" ? e.text.trim() : "";
          if (text) finalCb.current(text);
          if (done()) end("idle");
          return;
        }
        case "error":
          if (!l.stopping) return end("unavailable");
          l.awaitingCommit = false; // e.g. nothing was left to commit
          if (done()) end("idle");
          return;
        case "closed":
          return end(l.stopping ? "idle" : "unavailable");
      }
    },
    [end],
  );

  const start = useCallback(async () => {
    if (live.current || !supported()) return;
    const l: Live = { seconds: 0, stopping: false, awaitingCommit: false, partials: new Map() };
    live.current = l;
    setState("asking");
    setPartial("");
    setSeconds(0);
    try {
      l.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (live.current === l) end("denied");
      return;
    }
    if (live.current !== l) return closeAll(l);
    let secret: string;
    try {
      secret = (await createVoiceSession()).clientSecret;
    } catch (e) {
      if (live.current !== l) return closeAll(l);
      return end(e instanceof ApiClientError && e.status === 429 ? "limit" : "unavailable");
    }
    if (live.current !== l) return closeAll(l);
    l.transport = openTranscription(secret, (e) => onEvent(l, e));
    try {
      const transport = l.transport;
      const stopCapture = await startCapture(l.stream, (audio) => transport.sendAudio(audio));
      if (live.current !== l) return stopCapture();
      l.stopCapture = stopCapture;
    } catch {
      if (live.current !== l) return closeAll(l);
      return end("unavailable");
    }
    setState("recording");
    l.tick = setInterval(() => {
      l.seconds += 1;
      setSeconds(l.seconds);
      if (l.seconds >= VOICE.maxSeconds) stop();
    }, 1000);
  }, [end, onEvent, stop]);

  useEffect(
    () => () => {
      const l = live.current;
      live.current = null;
      if (l) closeAll(l);
    },
    [],
  );

  const onFinal = useCallback((cb: (text: string) => void) => {
    finalCb.current = cb;
  }, []);

  return {
    state,
    partial,
    seconds,
    start: () => void start(),
    stop,
    onFinal,
  };
}
