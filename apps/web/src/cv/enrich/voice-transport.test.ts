import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePcm16, makeResampler } from "./mic.ts";
import { openTranscription, type TranscriptEvent } from "./realtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const pcm = (b64: string) => {
  const view = new DataView(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
  return Array.from({ length: view.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true));
};

describe("realtime connection", () => {
  it("passes the key as a subprotocol, never in the URL, and maps transcript events", () => {
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 0;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
      constructor(
        readonly url: string,
        readonly protocols: string[],
      ) {
        sockets.push(this);
      }
      send(data: string) {
        this.sent.push(data);
      }
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    const events: TranscriptEvent[] = [];
    const tr = openTranscription("ek_secret", (e) => events.push(e));
    const ws = sockets[0];
    if (!ws) throw new Error("no socket opened");
    expect(ws.url).toBe("wss://api.openai.com/v1/realtime?intent=transcription");
    expect(ws.url).not.toContain("ek_secret");
    expect(ws.protocols).toEqual(["realtime", "openai-insecure-api-key.ek_secret"]);

    tr.sendAudio("AAAA"); // held until the socket opens
    expect(ws.sent).toEqual([]);
    ws.readyState = 1;
    ws.onopen?.();
    tr.commit();
    expect(ws.sent.map((s) => JSON.parse(s))).toEqual([
      { type: "input_audio_buffer.append", audio: "AAAA" },
      { type: "input_audio_buffer.commit" },
    ]);

    const msg = (data: object) => ws.onmessage?.({ data: JSON.stringify(data) });
    msg({ type: "session.created" });
    msg({ type: "conversation.item.input_audio_transcription.delta", item_id: "i1", delta: "hi" });
    msg({ type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "Hi." });
    msg({ type: "conversation.item.input_audio_transcription.failed", item_id: "i2" });
    msg({ type: "input_audio_buffer.committed", item_id: "i3" });
    msg({ type: "error", error: { message: "x" } });
    ws.onclose?.();
    expect(events).toEqual([
      { type: "partial", itemId: "i1", text: "hi" },
      { type: "final", itemId: "i1", text: "Hi." },
      { type: "failed", itemId: "i2" },
      { type: "committed", itemId: "i3" },
      { type: "error" },
      { type: "closed" },
    ]);
    tr.close();
    expect(ws.close).toHaveBeenCalled();
  });
});

describe("microphone audio", () => {
  it("encodes PCM16 little-endian base64", () => {
    expect(pcm(encodePcm16(new Float32Array([0, 1, -1, 0.5])))).toEqual([0, 32767, -32768, 16384]);
  });

  it("clamps samples beyond ±1 instead of wrapping around", () => {
    expect(pcm(encodePcm16(new Float32Array([1.5, -2, 40, -Infinity])))).toEqual([32767, -32768, 32767, -32768]);
  });

  it("resamples to 24 kHz across chunks", () => {
    const same = makeResampler(24_000);
    expect(same(new Float32Array(480))).toHaveLength(480);
    const down = makeResampler(48_000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += down(new Float32Array(480).fill(0.25)).length;
    expect(total).toBeGreaterThanOrEqual(2399);
    expect(total).toBeLessThanOrEqual(2401);
  });
});
