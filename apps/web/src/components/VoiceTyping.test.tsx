import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceTyping } from "./VoiceTyping";
import { LanguageContext } from "./ui";
let captures: FakeRecorder[];
let stopTrack: ReturnType<typeof vi.fn>;
class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    captures.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recording"]) });
    this.onstop?.();
  }
}
beforeEach(() => {
  captures = [];
  stopTrack = vi.fn();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function view(props: Partial<React.ComponentProps<typeof VoiceTyping>> = {}) {
  return (
    <LanguageContext.Provider value="en">
      <VoiceTyping
        transcribe={vi.fn(async () => "A transcript")}
        onTranscript={vi.fn()}
        {...props}
      />
    </LanguageContext.Provider>
  );
}
async function start() {
  fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
  await screen.findByRole("button", { name: "Stop and transcribe" });
}
it("records only after explicit start, transcribes on stop, and delivers editable text once", async () => {
  const transcribe = vi.fn(async () => "A transcript"),
    onTranscript = vi.fn(),
    onBusyChange = vi.fn();
  render(view({ transcribe, onTranscript, onBusyChange }));
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  await start();
  expect(transcribe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
  await waitFor(() =>
    expect(onTranscript).toHaveBeenCalledWith("A transcript"),
  );
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(stopTrack).toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});
it("cancel and unmount stop tracks without uploading a recording", async () => {
  const transcribe = vi.fn();
  const result = render(view({ transcribe }));
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(transcribe).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledTimes(1);
  await start();
  result.unmount();
  expect(transcribe).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledTimes(2);
});
it("question replacement aborts a transcript and discards its late result", async () => {
  let finish!: (text: string) => void;
  const transcribe = vi.fn(
    (_audio: Blob, _signal: AbortSignal) =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const onTranscript = vi.fn();
  const result = render(view({ transcribe, onTranscript }));
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
  result.unmount();
  expect(transcribe.mock.calls[0][1].aborted).toBe(true);
  await act(async () => finish("Late text"));
  expect(onTranscript).not.toHaveBeenCalled();
});
it("a late microphone permission result after cancel releases its stream", async () => {
  let allow!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
    () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  );
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () =>
    allow({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream),
  );
  expect(stopTrack).toHaveBeenCalled();
  expect(captures).toHaveLength(0);
});
it("microphone denial and uncertain provider failure have honest fallbacks without retries", async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
    new DOMException("Denied", "NotAllowedError"),
  );
  const transcribe = vi
    .fn()
    .mockRejectedValue({ code: "VOICE_OUTCOME_UNKNOWN" });
  render(view({ transcribe }));
  fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Allow microphone access",
  );
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "recording was not resent",
    ),
  );
  expect(transcribe).toHaveBeenCalledTimes(1);
});
it("uses the current answer capacity and preserves an overflowing transcript for review", async () => {
  let finish!: (text: string) => void;
  const transcribe = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const onTranscript = vi.fn();
  const result = render(
    view({ transcribe, onTranscript, remainingCharacters: 100 }),
  );
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
  result.rerender(view({ transcribe, onTranscript, remainingCharacters: 3 }));
  await act(async () => finish("The complete transcript"));
  expect(onTranscript).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Full transcript",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("The complete transcript");
  result.rerender(view({ transcribe, onTranscript, remainingCharacters: 100 }));
  fireEvent.click(screen.getByRole("button", { name: "Add to answer" }));
  expect(onTranscript).toHaveBeenCalledWith("The complete transcript");
});
it("stops recording automatically after two minutes and rejects oversized audio", async () => {
  const transcribe = vi.fn(async () => "Done");
  render(view({ transcribe }));
  await start();
  vi.useFakeTimers();
  // Recording's interval was created with real timers; use a fresh capture with fake timers.
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Dictate answer" })),
  );
  await act(async () => vi.advanceTimersByTime(120000));
  expect(transcribe).toHaveBeenCalledTimes(1);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Dictate answer" })),
  );
  act(() =>
    captures.at(-1)?.ondataavailable?.({
      data: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]),
    }),
  );
  expect(screen.getByRole("alert").textContent).toContain("too large");
  expect(transcribe).toHaveBeenCalledTimes(1);
});
it("prefers automatic recorded transcription even when browser speech recognition exists", async () => {
  const recognition = vi.fn();
  vi.stubGlobal("SpeechRecognition", recognition);
  const transcript = "J’ai dirigé une équipe. لقد حسنت الخدمة",
    append = vi.fn();
  render(
    view({
      language: "ar",
      transcribe: async () => transcript,
      onTranscript: append,
    }),
  );
  await start();
  expect(recognition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
  await waitFor(() => expect(append).toHaveBeenCalledWith(transcript));
});
