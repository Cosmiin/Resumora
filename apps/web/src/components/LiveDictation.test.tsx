import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { LiveDictation } from "./LiveDictation";
import type { VoiceTypingProps } from "./VoiceTyping";
const VoiceTyping = (props: VoiceTypingProps) => (
  <LiveDictation {...props} useRecording={() => {}} />
);
import { LanguageContext } from "./ui";
class Recognition {
  static instance: Recognition;
  lang = "";
  continuous = false;
  interimResults = false;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: any) => void;
  onresult?: (e: any) => void;
  constructor() {
    Recognition.instance = this;
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort = vi.fn();
  result(text: string, final = false) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: final })],
    });
  }
}
beforeEach(() => vi.stubGlobal("SpeechRecognition", Recognition));
afterEach(() => vi.unstubAllGlobals());
it("shows interim words, appends final speech once, and uses explicitly provided speech language", () => {
  const append = vi.fn(),
    transcribe = vi.fn();
  render(
    <LanguageContext value="en">
      <VoiceTyping
        language="ro"
        transcribe={transcribe}
        onTranscript={append}
      />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
  expect(Recognition.instance.lang).toBe("ro");
  act(() => Recognition.instance.result("Am pregătit"));
  expect(
    screen.getByRole("status", { name: "Live transcript" }).textContent,
  ).toContain("Am pregătit");
  expect(append).not.toHaveBeenCalled();
  act(() => Recognition.instance.result("Am pregătit rapoarte.", true));
  act(() => Recognition.instance.result("Am pregătit rapoarte.", true));
  expect(append).toHaveBeenCalledExactlyOnceWith("Am pregătit rapoarte.");
  fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
  expect(transcribe).not.toHaveBeenCalled();
});
it("retains partial speech on failure and lets the user edit before appending", () => {
  const append = vi.fn();
  render(
    <LanguageContext value="en">
      <VoiceTyping transcribe={vi.fn()} onTranscript={append} />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
  act(() => Recognition.instance.result("Draft words"));
  act(() => Recognition.instance.onerror?.({ error: "network" }));
  expect(screen.getByRole("alert").textContent).toContain("preserved");
  fireEvent.change(
    screen.getByRole("textbox", { name: "Unfinished transcript" }),
    { target: { value: "Corrected words" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to answer" }));
  expect(append).toHaveBeenCalledExactlyOnceWith("Corrected words");
});
it("aborts on unmount and ignores late speech without appending", () => {
  const append = vi.fn();
  const view = render(
    <VoiceTyping transcribe={vi.fn()} onTranscript={append} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Dictează răspunsul" }));
  const late = Recognition.instance.onresult;
  view.unmount();
  act(() =>
    late?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "late" }], { isFinal: true })],
    }),
  );
  expect(Recognition.instance.abort).toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
});
it.each(["capacity", "rejected append"])(
  "retains every final segment in order while stopping after %s overflow",
  (reason) => {
    const append = vi.fn(() => false);
    render(
      <LanguageContext value="en">
        <VoiceTyping
          transcribe={vi.fn()}
          onTranscript={append}
          remainingCharacters={reason === "capacity" ? 10 : 100}
        />
      </LanguageContext>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dictate answer" }));
    const recognition = Recognition.instance;
    // Browsers can flush more final results between stop() and onend.
    const stop = vi.spyOn(recognition, "stop").mockImplementation(() => {});
    act(() => recognition.result("First retained sentence.", true));
    act(() =>
      recognition.onresult?.({
        resultIndex: 1,
        results: [
          Object.assign([{ transcript: "First retained sentence." }], {
            isFinal: true,
          }),
          Object.assign([{ transcript: "Last." }], { isFinal: true }),
        ],
      }),
    );
    act(() => recognition.onend?.());
    expect(
      (
        screen.getByRole("textbox", {
          name: "Unfinished transcript",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("First retained sentence.\nLast.");
    expect(stop).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledTimes(reason === "capacity" ? 0 : 1);
  },
);
