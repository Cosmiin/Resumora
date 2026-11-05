import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Question } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { TranscriptEvent } from "./realtime.ts";

const api = vi.hoisted(() => ({ createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);
const mic = vi.hoisted(() => ({ startCapture: vi.fn() }));
vi.mock("./mic.ts", () => mic);
const rt = vi.hoisted(() => ({ openTranscription: vi.fn() }));
vi.mock("./realtime.ts", () => rt);

import { AnswerBox, type Via } from "./AnswerBox.tsx";
import { useVoice } from "./useVoice.ts";

const question: Question = {
  bulletId: "b1",
  text: "What papers did you handle?",
  options: ["Customs papers", "Carrier invoices", "Delivery notes"],
};

function Harness({ onChange }: { onChange?: (value: string, via: Via[]) => void }) {
  const [s, set] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  return (
    <AnswerBox
      question={question}
      value={s.value}
      via={s.via}
      onChange={(value, via) => {
        onChange?.(value, via);
        set({ value, via });
      }}
    />
  );
}

/** A transport the test drives by hand: `emit` plays a server event. */
function fakeTransport() {
  const t = { emit: (_e: TranscriptEvent) => {}, sendAudio: vi.fn(), commit: vi.fn(), close: vi.fn() };
  rt.openTranscription.mockImplementation((_secret: string, onEvent: (e: TranscriptEvent) => void) => {
    t.emit = onEvent;
    return t;
  });
  return t;
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] };
const getUserMedia = vi.fn();
const stopCapture = vi.fn();

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

const box = () => screen.getByRole("textbox", { name: "Your answer" });
const micButton = () => screen.queryByRole("button", { name: /Answer by speaking|Stop recording/ });
const NOTICE = "Your voice goes to OpenAI to be turned into text. We don't keep the recording.";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue(stream);
  setMediaDevices({ getUserMedia });
  api.createVoiceSession.mockResolvedValue({ clientSecret: "ek_test", expiresAt: "2026-11-05T10:00:00.000Z", model: "gpt-4o-mini-transcribe" });
  mic.startCapture.mockResolvedValue(stopCapture);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setMediaDevices(undefined);
});

describe("AnswerBox: picking and typing", () => {
  it("shows a chip per option, then a last 'Something else' chip that focuses the box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chips = screen.getAllByRole("button").filter((b) => b.classList.contains("answer-opt"));
    expect(chips.map((c) => c.textContent)).toEqual([...question.options, "Something else"]);
    await user.click(screen.getByRole("button", { name: "Something else" }));
    expect(box()).toHaveFocus();
  });

  it("joins picked chips with ', ' and removes one when picked again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.click(screen.getByRole("button", { name: "Carrier invoices" }));
    expect(box()).toHaveValue("Customs papers, Carrier invoices");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers, Carrier invoices", ["pick"]);
    expect(screen.getByRole("button", { name: "Customs papers" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    expect(box()).toHaveValue("Carrier invoices");
    expect(screen.getByRole("button", { name: "Customs papers" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps typed text when chips are added and removed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(box(), "Checked every crate");
    await user.click(screen.getByRole("button", { name: "Delivery notes" }));
    expect(box()).toHaveValue("Checked every crate, Delivery notes");
    await user.click(screen.getByRole("button", { name: "Carrier invoices" }));
    await user.click(screen.getByRole("button", { name: "Delivery notes" }));
    expect(box()).toHaveValue("Checked every crate, Carrier invoices");
  });

  it("a chip never saves or submits anything", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.click(screen.getByRole("button", { name: "Something else" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(api.createVoiceSession).not.toHaveBeenCalled();
  });

  it("typing after picking gives via ['pick', 'type']", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.type(box(), " daily");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers daily", ["pick", "type"]);
  });
});

describe("AnswerBox: speaking", () => {
  it("shows live words in a muted span while recording, and final words land in the box", async () => {
    const user = userEvent.setup();
    const t = fakeTransport();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));

    const stop = await screen.findByRole("button", { name: "Stop recording" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Listening… 0:00 of 1:00/)).toBeInTheDocument();
    expect(rt.openTranscription).toHaveBeenCalledWith("ek_test", expect.any(Function));

    act(() => t.emit({ type: "partial", itemId: "i1", text: "about forty" }));
    act(() => t.emit({ type: "partial", itemId: "i1", text: " a week" }));
    const live = screen.getByText("about forty a week");
    expect(live).toHaveClass("answer-partial");
    expect(live.closest("[aria-live='polite']")).not.toBeNull();
    expect(box()).toHaveValue("Customs papers");

    act(() => t.emit({ type: "final", itemId: "i1", text: "About forty a week." }));
    expect(box()).toHaveValue("Customs papers, About forty a week.");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers, About forty a week.", ["pick", "voice"]);
    expect(screen.queryByText("about forty a week")).toBeNull();

    // a second turn split by the server joins with a space
    act(() => t.emit({ type: "final", itemId: "i2", text: "Mostly by email." }));
    expect(box()).toHaveValue("Customs papers, About forty a week. Mostly by email.");

    await user.click(stop);
    expect(stopCapture).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(t.commit).toHaveBeenCalled();
    expect(t.close).not.toHaveBeenCalled();
    act(() => t.emit({ type: "committed", itemId: "i3" }));
    act(() => t.emit({ type: "final", itemId: "i3", text: "Then filed them." }));
    expect(box()).toHaveValue("Customs papers, About forty a week. Mostly by email. Then filed them.");
    expect(t.close).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Answer by speaking" })).toHaveAttribute("aria-pressed", "false");
  });

  it("stops by itself at 60 s, with a countdown for the last 10 s", async () => {
    vi.useFakeTimers();
    const t = fakeTransport();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(49_000));
    expect(screen.getByText(/Listening… 0:49 of 1:00/)).toBeInTheDocument();
    expect(screen.queryByText(/Stops in/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText(/Stops in 10 s/)).toBeInTheDocument();
    expect(t.commit).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalled();
    // no final words come back: it gives up waiting after 1.5 s
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(t.close).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Answer by speaking" })).not.toBeDisabled();
  });

  it("a blocked microphone hides the mic and says so", async () => {
    const user = userEvent.setup();
    getUserMedia.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByText("Microphone blocked. You can still type or pick.")).toBeInTheDocument();
    expect(micButton()).toBeNull();
    expect(api.createVoiceSession).not.toHaveBeenCalled();
  });

  it("no microphone support → unavailable, mic hidden", () => {
    setMediaDevices(undefined);
    render(<Harness />);
    expect(micButton()).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    const { result } = renderHook(() => useVoice({ locale: "en" }));
    expect(result.current.state).toBe("unavailable");
  });

  it("the daily limit → limit, with the limit message", async () => {
    const user = userEvent.setup();
    api.createVoiceSession.mockRejectedValue(new ApiClientError(429, "voice_limit", "limit"));
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByText("You've used today's voice answers. You can still type or pick.")).toBeInTheDocument();
    expect(micButton()).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(rt.openTranscription).not.toHaveBeenCalled();
  });

  it("voice service down → unavailable with a message, microphone stopped", async () => {
    const user = userEvent.setup();
    api.createVoiceSession.mockRejectedValue(new ApiClientError(503, "ai_unavailable", "down"));
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByText("Voice answers aren't available right now. You can still type or pick.")).toBeInTheDocument();
    expect(micButton()).toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it("the connection dropping mid-recording closes everything", async () => {
    const user = userEvent.setup();
    const t = fakeTransport();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await screen.findByRole("button", { name: "Stop recording" });
    act(() => t.emit({ type: "closed" }));
    expect(t.close).toHaveBeenCalled();
    expect(stopCapture).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByText("Voice answers aren't available right now. You can still type or pick.")).toBeInTheDocument();
  });

  it("closes the connection and the microphone on unmount", async () => {
    const user = userEvent.setup();
    const t = fakeTransport();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await screen.findByRole("button", { name: "Stop recording" });
    unmount();
    expect(t.close).toHaveBeenCalled();
    expect(stopCapture).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops a microphone granted after unmount", async () => {
    let grant: (s: typeof stream) => void = () => {};
    getUserMedia.mockReturnValue(new Promise((r) => (grant = r)));
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    unmount();
    await act(async () => grant(stream));
    expect(track.stop).toHaveBeenCalled();
    expect(api.createVoiceSession).not.toHaveBeenCalled();
  });

  it("shows the privacy notice before the first recording only", async () => {
    const user = userEvent.setup();
    fakeTransport();
    const first = render(<Harness />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await screen.findByRole("button", { name: "Stop recording" });
    expect(screen.queryByText(NOTICE)).toBeNull();
    first.unmount();
    render(<Harness />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("still works when the browser refuses storage", async () => {
    const user = userEvent.setup();
    fakeTransport();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Harness />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });
});

describe("realtime connection", () => {
  it("passes the key as a subprotocol, never in the URL, and maps transcript events", async () => {
    const real = await vi.importActual<typeof import("./realtime.ts")>("./realtime.ts");
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
    const tr = real.openTranscription("ek_secret", (e) => events.push(e));
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
    vi.unstubAllGlobals();
  });
});

describe("microphone audio", () => {
  it("encodes PCM16 little-endian base64 and resamples to 24 kHz", async () => {
    const real = await vi.importActual<typeof import("./mic.ts")>("./mic.ts");
    const b64 = real.encodePcm16(new Float32Array([0, 1, -1, 0.5]));
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    expect([0, 2, 4, 6].map((o) => view.getInt16(o, true))).toEqual([0, 32767, -32768, 16384]);

    const same = real.makeResampler(24_000);
    expect(same(new Float32Array(480))).toHaveLength(480);
    const down = real.makeResampler(48_000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += down(new Float32Array(480).fill(0.25)).length;
    expect(total).toBeGreaterThanOrEqual(2399);
    expect(total).toBeLessThanOrEqual(2401);
  });
});
