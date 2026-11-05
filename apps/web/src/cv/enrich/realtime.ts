/*
 * The live transcription connection to OpenAI, straight from the browser (confirmed in Task 9).
 * The short-lived key travels as a WebSocket subprotocol, never in the URL, and is never logged.
 */

const URL_TRANSCRIBE = "wss://api.openai.com/v1/realtime?intent=transcription";

/** What the connection reports, in plain terms. */
export type TranscriptEvent =
  | { type: "partial"; itemId: string; text: string }
  | { type: "final"; itemId: string; text: string }
  | { type: "failed"; itemId: string }
  /** The server took a piece of audio and will transcribe it. */
  | { type: "committed"; itemId: string }
  /** The server reported an error (for example, nothing left to commit). */
  | { type: "error" }
  /** The connection closed without us asking. */
  | { type: "closed" };

export type Transport = {
  /** Resolves when the connection opens; rejects if it closes first. */
  opened: Promise<void>;
  /** Base64 PCM16 mono 24 kHz. Held until the connection opens. */
  sendAudio(audio: string): void;
  /** Ask for the audio so far to be transcribed now. */
  commit(): void;
  close(): void;
};

function toEvent(raw: unknown): TranscriptEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { type?: unknown; item_id?: unknown; delta?: unknown; transcript?: unknown };
  const itemId = typeof m.item_id === "string" ? m.item_id : "";
  switch (m.type) {
    case "conversation.item.input_audio_transcription.delta":
      return { type: "partial", itemId, text: typeof m.delta === "string" ? m.delta : "" };
    case "conversation.item.input_audio_transcription.completed":
      return { type: "final", itemId, text: typeof m.transcript === "string" ? m.transcript : "" };
    case "conversation.item.input_audio_transcription.failed":
      return { type: "failed", itemId };
    case "input_audio_buffer.committed":
      return { type: "committed", itemId };
    case "error":
      return { type: "error" };
    default:
      return null;
  }
}

export function openTranscription(clientSecret: string, onEvent: (e: TranscriptEvent) => void): Transport {
  const ws = new WebSocket(URL_TRANSCRIBE, ["realtime", `openai-insecure-api-key.${clientSecret}`]);
  let markOpen!: () => void;
  let failOpen!: (error: Error) => void;
  const opened = new Promise<void>((resolve, reject) => { markOpen = resolve; failOpen = reject; });
  const queue: string[] = [];
  let closedByUs = false;
  const send = (msg: object) => {
    const data = JSON.stringify(msg);
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
    else queue.push(data);
  };
  ws.onopen = () => {
    for (const data of queue.splice(0)) ws.send(data);
    markOpen();
  };
  ws.onmessage = (e: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(e.data));
    } catch {
      return;
    }
    const event = toEvent(parsed);
    if (event) onEvent(event);
  };
  ws.onclose = () => {
    failOpen(new Error("Voice connection closed before opening"));
    if (!closedByUs) onEvent({ type: "closed" });
  };
  return {
    opened,
    sendAudio: (audio) => send({ type: "input_audio_buffer.append", audio }),
    commit: () => send({ type: "input_audio_buffer.commit" }),
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}
