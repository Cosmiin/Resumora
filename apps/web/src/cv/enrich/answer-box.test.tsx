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
  kind: "detail",
  text: "What papers did you handle?",
  options: ["Customs papers", "Carrier invoices", "Delivery notes"],
};

function Harness({ onChange, q = question }: { onChange?: (value: string, via: Via[]) => void; q?: Question }) {
  const [s, set] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  return (
    <AnswerBox
      question={q}
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
const STOPPED = "Voice stopped. Try again, or type or pick.";

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

  it("voice service down → back to idle with a message; the mic stays and works again", async () => {
    const user = userEvent.setup();
    const t = fakeTransport();
    api.createVoiceSession.mockRejectedValueOnce(new ApiClientError(503, "ai_unavailable", "down"));
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByText(STOPPED)).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    expect(screen.queryByText(STOPPED)).toBeNull();
    expect(t.close).not.toHaveBeenCalled();
  });

  it.each([
    ["the connection closing", { type: "closed" }],
    ["a server error", { type: "error" }],
  ] as const)("%s mid-recording closes everything, keeps finished words, and the mic stays", async (_, event) => {
    const user = userEvent.setup();
    const t = fakeTransport();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await screen.findByRole("button", { name: "Stop recording" });
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
    const user = userEvent.setup();
    const t = fakeTransport();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    await screen.findByRole("button", { name: "Stop recording" });
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

  it("hides the privacy notice in every open box after the first recording", async () => {
    const user = userEvent.setup();
    fakeTransport();
    render(
      <>
        <Harness />
        <Harness />
      </>,
    );
    expect(screen.getAllByText(NOTICE)).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Answer by speaking" })[0] as HTMLElement);
    await screen.findByRole("button", { name: "Stop recording" });
    expect(screen.queryAllByText(NOTICE)).toHaveLength(0);
  });

  it("still records when the browser refuses storage", async () => {
    const user = userEvent.setup();
    fakeTransport();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(await screen.findByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull(); // remembered for this page
  });
});
