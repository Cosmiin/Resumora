import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE, type Locale } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import { createVoiceSession } from "./enrich-api.ts";
import { startCapture } from "./mic.ts";
import { openTranscription, type TranscriptEvent, type Transport } from "./realtime.ts";

/** `denied`, `unavailable` (no microphone support) and `limit` hide the mic; everything else can record again. */
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
  /** Pieces in the order the server took them; finished ones wait here until every earlier one is done. */
  order: string[];
  /** Finished pieces: their final text, or "" when transcription failed. */
  done: Map<string, string>;
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

const track = (l: Live, itemId: string) => {
  if (!l.order.includes(itemId)) l.order.push(itemId);
};

/** Hands finished pieces over in the server's order. `all`: the recording is over, so skip pieces that never finished. */
function drain(l: Live, emit: (text: string) => void, all = false) {
  while (l.order.length) {
    const id = l.order[0] as string;
    if (!l.done.has(id) && !all) return;
    l.order.shift();
    const text = l.done.get(id)?.trim();
    l.done.delete(id);
    if (text) emit(text);
  }
}

/**
 * Live voice answers: the microphone goes straight to OpenAI on a short-lived key and the words come
 * back as they are spoken. `partial` holds words still being worked out; finished pieces go to `onFinal`,
 * in the order they were spoken. `interrupted`: the last recording broke off; the mic can be tried again.
 * The language comes from the saved CV on the server; `locale` is the same CV's language.
 */
export function useVoice(_opts: { locale: Locale }) {
  const [state, setState] = useState<VoiceState>(() => (supported() ? "idle" : "unavailable"));
  const [partial, setPartial] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const live = useRef<Live | null>(null);
  const finalCb = useRef<(text: string) => void>(() => {});
  const emit = useCallback((text: string) => finalCb.current(text), []);

  /** Ends the current recording: hands over finished words, then closes the microphone and the connection. */
  const end = useCallback(
    (next: VoiceState, broke = false) => {
      const l = live.current;
      live.current = null;
      if (l) {
        drain(l, emit, true);
        closeAll(l);
      }
      setPartial("");
      setInterrupted(broke);
      setState(next);
    },
    [emit],
  );

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
      const finished = () => l.stopping && !l.awaitingCommit && l.order.length === 0;
      switch (e.type) {
        case "partial":
          track(l, e.itemId);
          l.partials.set(e.itemId, (l.partials.get(e.itemId) ?? "") + e.text);
          return show();
        case "committed":
          track(l, e.itemId);
          if (l.stopping) l.awaitingCommit = false;
          return;
        case "final":
        case "failed":
          track(l, e.itemId);
          l.partials.delete(e.itemId);
          l.done.set(e.itemId, e.type === "final" ? e.text : "");
          show();
          drain(l, emit);
          if (finished()) end("idle");
          return;
        case "error":
          if (!l.stopping) return end("idle", true);
          l.awaitingCommit = false; // e.g. nothing was left to commit
          if (finished()) end("idle");
          return;
        case "closed":
          return l.stopping ? end("idle") : end("idle", true);
      }
    },
    [end, emit],
  );

  const start = useCallback(async () => {
    if (live.current || !supported()) return;
    const l: Live = { seconds: 0, stopping: false, awaitingCommit: false, partials: new Map(), order: [], done: new Map() };
    live.current = l;
    setState("asking");
    setInterrupted(false);
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
      return e instanceof ApiClientError && e.status === 429 ? end("limit") : end("idle", true);
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
      return end("idle", true);
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
    interrupted,
    start: () => void start(),
    stop,
    onFinal,
  };
}
