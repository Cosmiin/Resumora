import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
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
import { latinOnly, useVoice } from "./useVoice.ts";

const question: Question = {
  bulletId: "b1",
  kind: "detail",
  text: "What papers did you handle?",
  options: ["Customs papers", "Carrier invoices", "Delivery notes"],
};

function Harness({ onChange, q = question, maxSeconds }: { onChange?: (value: string, via: Via[]) => void; q?: Question; maxSeconds?: number }) {
  const [s, set] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  return (
    <AnswerBox
      question={q}
      maxSeconds={maxSeconds}
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
function fakeTransport(openDelay = 0) {
  let open!: () => void;
  let failOpen!: (error: Error) => void;
  const opened = new Promise<void>((resolve, reject) => { open = resolve; failOpen = reject; });
  const t = { opened, failOpen, emit: (_e: TranscriptEvent) => {}, sendAudio: vi.fn(), commit: vi.fn(), close: vi.fn(() => failOpen(new Error("Connection closed"))) };
  rt.openTranscription.mockImplementation((_secret: string, onEvent: (e: TranscriptEvent) => void) => {
    t.emit = onEvent;
    if (openDelay) setTimeout(open, openDelay);
    else open();
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
const STOPPED = "Voice stopped. Try again, or type or pick.";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  getUserMedia.mockResolvedValue(stream);
  setMediaDevices({ getUserMedia });
  api.createVoiceSession.mockResolvedValue({ clientSecret: "ek_test", expiresAt: "2026-11-05T10:00:00.000Z", model: "gpt-4o-mini-transcribe" });
  mic.startCapture.mockResolvedValue(stopCapture);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setMediaDevices(undefined);
});

describe("latinOnly", () => {
  it.each([
    ["Am lucrat cu ăâîșț, 50%.", "Am lucrat cu ăâîșț, 50%."],
    ["어 Yeah 비 helping", "Yeah helping"],
    ["어 비", ""],
  ])("filters %s", (text, expected) => {
    expect(latinOnly(text)).toBe(expected);
  });
});

describe("AnswerBox: speaking", () => {
  it("shows live words in a muted span while recording, and final words land in the box", async () => {
    const t = fakeTransport();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Customs papers" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    const stop = screen.getByRole("button", { name: "Stop recording" });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Listening… 0:00 of 1:00/)).toBeInTheDocument();
    expect(rt.openTranscription).toHaveBeenCalledWith("ek_test", expect.any(Function));

    act(() => t.emit({ type: "partial", itemId: "i1", text: "about forty" }));
    act(() => t.emit({ type: "partial", itemId: "i1", text: " a week" }));
    const live = document.querySelector(".answer-partial");
    expect(live).toHaveTextContent("about forty a week");
    expect(live).toHaveClass("answer-partial");
    expect(live?.closest("[aria-live='polite']")).not.toBeNull();
    expect(box()).toHaveValue("Customs papers");

    act(() => t.emit({ type: "final", itemId: "i1", text: "About forty a week." }));
    expect(box()).toHaveValue("Customs papers, About forty a week.");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers, About forty a week.", ["pick", "voice"]);
    expect(screen.queryByText("about forty a week")).toBeNull();

    // a second turn split by the server joins with a space
    act(() => t.emit({ type: "final", itemId: "i2", text: "Mostly by email." }));
    expect(box()).toHaveValue("Customs papers, About forty a week. Mostly by email.");

    await act(async () => { fireEvent.click(stop); });
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
    await act(() => vi.advanceTimersByTimeAsync(3_000));
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
    getUserMedia.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    expect(screen.getByText("Microphone blocked. You can still type or pick.")).toBeInTheDocument();
    expect(micButton()).toBeNull();
    expect(api.createVoiceSession).toHaveBeenCalledTimes(1);
  });

  it("no microphone support → unavailable, mic hidden", () => {
    setMediaDevices(undefined);
    render(<Harness />);
    expect(micButton()).toBeNull();
    expect(screen.queryByText(/OpenAI/i)).toBeNull();
    const { result } = renderHook(() => useVoice({ locale: "en" }));
    expect(result.current.state).toBe("unavailable");
  });

  it("the daily limit → limit, with the limit message", async () => {
    api.createVoiceSession.mockRejectedValue(new ApiClientError(429, "voice_limit", "limit"));
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    expect(screen.getByText("You've used today's voice answers. You can still type or pick.")).toBeInTheDocument();
    expect(micButton()).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(rt.openTranscription).not.toHaveBeenCalled();
  });

  it("voice service down → back to idle with a message; the mic stays and works again", async () => {
    const t = fakeTransport();
    api.createVoiceSession.mockRejectedValueOnce(new ApiClientError(503, "ai_unavailable", "down"));
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    expect(screen.getByText(STOPPED)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    expect(screen.queryByText(STOPPED)).toBeNull();
    expect(t.close).not.toHaveBeenCalled();
  });

  it.each([
    ["the connection closing", { type: "closed" }],
    ["a server error", { type: "error" }],
  ] as const)("%s mid-recording closes everything, keeps finished words, and the mic stays", async (_, event) => {
    const t = fakeTransport();
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    screen.getByRole("button", { name: "Stop recording" });
    act(() => t.emit({ type: "final", itemId: "i1", text: "Forty a week." }));
    act(() => t.emit(event));
    expect(t.close).toHaveBeenCalled();
    expect(stopCapture).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(box()).toHaveValue("Forty a week.");
    expect(screen.getByText(STOPPED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer by speaking" })).not.toBeDisabled();
  });

  it("puts out-of-order final words back in the order they were spoken", async () => {
    const t = fakeTransport();
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    screen.getByRole("button", { name: "Stop recording" });
    act(() => t.emit({ type: "committed", itemId: "i1" }));
    act(() => t.emit({ type: "committed", itemId: "i2" }));
    act(() => t.emit({ type: "final", itemId: "i2", text: "Then filed them." }));
    expect(box()).toHaveValue("");
    act(() => t.emit({ type: "final", itemId: "i1", text: "Checked the papers." }));
    expect(box()).toHaveValue("Checked the papers. Then filed them.");
    // a failed piece doesn't hold back the ones after it
    act(() => t.emit({ type: "committed", itemId: "i3" }));
    act(() => t.emit({ type: "committed", itemId: "i4" }));
    act(() => t.emit({ type: "final", itemId: "i4", text: "Daily." }));
    act(() => t.emit({ type: "failed", itemId: "i3" }));
    expect(box()).toHaveValue("Checked the papers. Then filed them. Daily.");
  });

  it("closes the connection and the microphone on unmount", async () => {
    const t = fakeTransport();
    const { unmount } = render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    screen.getByRole("button", { name: "Stop recording" });
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
    await act(() => vi.advanceTimersByTimeAsync(0));
    unmount();
    await act(async () => grant(stream));
    expect(track.stop).toHaveBeenCalled();
    expect(api.createVoiceSession).toHaveBeenCalledTimes(1);
  });

  it("never shows provider copy before, during or after recording", async () => {
    fakeTransport();
    const first = render(<Harness />);
    expect(screen.queryByText(/OpenAI/i)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    screen.getByRole("button", { name: "Stop recording" });
    expect(screen.queryByText(/OpenAI/i)).toBeNull();
    first.unmount();
    render(<Harness />);
    expect(screen.queryByText(/OpenAI/i)).toBeNull();
  });

  it.each([false, true])("fades new live words unless reduced motion is %s", async (reducedMotion) => {
    vi.mocked(window.matchMedia).mockImplementation((media) => ({
      matches: media === "(prefers-reduced-motion: reduce)" && reducedMotion,
      media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const t = fakeTransport();
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    act(() => t.emit({ type: "partial", itemId: "i1", text: "Yeah" }));
    const first = container.querySelector(".answer-partial span");
    act(() => t.emit({ type: "partial", itemId: "i1", text: " helping" }));
    expect(container.querySelector(".answer-partial")).toHaveTextContent("Yeah helping");
    if (reducedMotion) {
      expect(container.querySelector(".voice-word-new")).toBeNull();
    } else {
      expect(screen.getByText("helping")).toHaveClass("voice-word-new");
      expect(container.querySelector(".answer-partial span")).toBe(first);
    }
    act(() => t.emit({ type: "final", itemId: "i1", text: "Yeah helping." }));
    expect(box()).toHaveValue("Yeah helping.");
    expect(container.querySelector(".voice-word-new")).toBeNull();
  });

  it("fades only new words when overlapping transcript items grow or finish", async () => {
    const t = fakeTransport();
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    act(() => t.emit({ type: "partial", itemId: "i1", text: "Checked" }));
    act(() => t.emit({ type: "partial", itemId: "i2", text: "Daily" }));
    const checked = screen.getByText("Checked");
    const daily = screen.getByText("Daily");

    act(() => t.emit({ type: "partial", itemId: "i1", text: " papers" }));
    expect(container.querySelector(".answer-partial")).toHaveTextContent("Checked papers Daily");
    expect(screen.getByText("Checked")).toBe(checked);
    expect(screen.getByText("papers")).toHaveClass("voice-word-new");
    expect(screen.getByText("papers")).not.toBe(daily);
    expect(screen.getByText("Daily")).toBe(daily);

    act(() => t.emit({ type: "final", itemId: "i1", text: "Checked papers." }));
    expect(box()).toHaveValue("Checked papers.");
    expect(screen.getByText("Daily")).toBe(daily);
    expect(container.querySelector(".answer-partial")).toHaveTextContent(/^Daily$/);
  });

  it("filters live and final transcripts and ignores non-Latin-only deltas", async () => {
    const t = fakeTransport();
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    act(() => t.emit({ type: "partial", itemId: "i1", text: "어 비" }));
    expect(container.querySelector(".answer-partial")).toBeNull();
    act(() => t.emit({ type: "partial", itemId: "i1", text: "어 Yeah " }));
    const word = screen.getByText("Yeah");
    act(() => t.emit({ type: "partial", itemId: "i1", text: "어 비" }));
    expect(screen.getByText("Yeah")).toBe(word);
    expect(container.querySelector(".answer-partial")).toHaveTextContent(/^Yeah$/);
    act(() => t.emit({ type: "partial", itemId: "i1", text: "help" }));
    act(() => t.emit({ type: "partial", itemId: "i1", text: "ing" }));
    expect(container.querySelector(".answer-partial")).toHaveTextContent("Yeah helping");
    act(() => t.emit({ type: "final", itemId: "i1", text: "어 Yeah 비 helping, 50%." }));
    expect(box()).toHaveValue("Yeah helping, 50%.");
    onChange.mockClear();
    act(() => t.emit({ type: "final", itemId: "i2", text: "어 비" }));
    expect(box()).toHaveValue("Yeah helping, 50%.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([" ", "어 비"])("keeps word boundaries across an invisible delta: %s", async (text) => {
    const t = fakeTransport();
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    act(() => t.emit({ type: "partial", itemId: "i1", text: "Yeah" }));
    const word = screen.getByText("Yeah");
    act(() => t.emit({ type: "partial", itemId: "i1", text }));
    expect(screen.getByText("Yeah")).toBe(word);
    expect(container.querySelector(".answer-partial")).toHaveTextContent(/^Yeah$/);
    act(() => t.emit({ type: "partial", itemId: "i1", text: "helping" }));
    expect(container.querySelector(".answer-partial")).toHaveTextContent("Yeah helping");
  });

  it("still records when the browser refuses storage", async () => {
    fakeTransport();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" })); });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    expect(screen.queryByText(/OpenAI/i)).toBeNull();
  });
});

describe("AnswerBox: voice countdown", () => {
  it("shows 3, 2, 1 a second apart, then starts recording", async () => {
    const t = fakeTransport();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(api.createVoiceSession).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("voice-countdown")).toHaveTextContent("3");
    expect(screen.getByTestId("voice-countdown")).toHaveAttribute("aria-live", "polite");
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("voice-countdown")).toHaveTextContent("2");
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("voice-countdown")).toHaveTextContent("1");
    expect(screen.queryByText(/Listening/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    expect(screen.getByText(/Listening… 0:00 of 1:00/)).toBeInTheDocument();
    expect(t.commit).not.toHaveBeenCalled();
  });

  it.each([500, 5_000])("waits for both countdown and transcription connection opening after %i ms", async (delay) => {
    const t = fakeTransport(delay);
    mic.startCapture.mockImplementationOnce((_stream, send) => {
      send("before-recording");
      return Promise.resolve(stopCapture);
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(2_999));
    expect(screen.getByTestId("voice-countdown")).toHaveTextContent("1");
    expect(t.sendAudio).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    if (delay > 3_000) {
      expect(screen.getByTestId("voice-countdown")).toHaveTextContent("1");
      expect(screen.getByText("Getting the mic ready…")).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(1_999));
      expect(screen.getByTestId("voice-countdown")).toHaveTextContent("1");
      await act(() => vi.advanceTimersByTimeAsync(1));
    }
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    expect(screen.getByText(/Listening… 0:00 of 1:00/)).toBeInTheDocument();
  });

  it("cancels cleanly while the transcription connection is still opening", async () => {
    const t = fakeTransport(5_000);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop recording" })); });
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(t.commit).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    expect(screen.queryByText(/Listening/)).toBeNull();
  });

  it("closes the microphone when the transcription connection fails before opening", async () => {
    const t = fakeTransport(5_000);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    await act(async () => t.failOpen(new Error("Connection closed")));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    expect(screen.getByText(STOPPED)).toBeInTheDocument();
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.queryByText(/Listening/)).toBeNull();
  });

  it("stops a brain dump at 120 seconds of recording", async () => {
    const t = fakeTransport();
    render(<Harness maxSeconds={120} />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByText(/Listening… 0:00 of 2:00/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(119_000));
    expect(screen.getByText(/Stops in 1 s/)).toBeInTheDocument();
    expect(t.commit).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(stopCapture).toHaveBeenCalledTimes(1);
  });

  it("never shows a countdown when the session request reaches the daily limit", async () => {
    let reject!: (error: Error) => void;
    api.createVoiceSession.mockReturnValueOnce(new Promise((_resolve, r) => { reject = r; }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    await act(async () => reject(new ApiClientError(429, "voice_limit", "limit")));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    expect(screen.getByText("You've used today's voice answers. You can still type or pick.")).toBeInTheDocument();
    expect(mic.startCapture).not.toHaveBeenCalled();
  });

  it("cancels the countdown, closes the session, and allows another recording", async () => {
    const t = fakeTransport();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(t.commit).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByTestId("voice-countdown")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByText(/Listening… 0:00 of 1:00/)).toBeInTheDocument();
  });
});
