import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useVoice, type VoiceState } from "./useVoice.ts";
import { SteeringStep } from "../../tailor/SteeringStep.tsx";
import { JobThoughts } from "../../jobs/JobThoughts.tsx";

vi.mock("./useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../../tailor/tailor-api.ts", () => ({ getToneExamples: vi.fn(() => new Promise(() => {})) }));

function voiceIn(state: VoiceState, extra: Partial<ReturnType<typeof useVoice>> = {}) {
  vi.mocked(useVoice).mockReturnValue({ state, count: state === "countdown" ? 2 : null, connecting: false, partial: "", partialWords: [],
    seconds: 1, interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn(), ...extra });
}

// T2: every mic uses the enrichment recording look (the AnswerBox mic, 3-2-1, "Start talking" and the recording bar).
const mics = {
  // The steering mic is on its second screen ("Anything else we should know?").
  "tailoring steering": () => {
    const view = render(<SteeringStep jobId="j1" roles={[]} busy={false} onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    return view;
  },
  "job thoughts": () => render(<JobThoughts value="" onSave={vi.fn(async () => ({}))} />),
};

describe.each(Object.entries(mics))("the %s mic", (_name, renderMic) => {
  beforeEach(() => vi.resetAllMocks());

  it("is the enrichment mic button", () => {
    voiceIn("idle");
    const { container } = renderMic();
    expect(container.querySelector("button.mic")).not.toBeNull();
  });

  it("counts down 3-2-1 with Get ready", () => {
    voiceIn("countdown");
    renderMic();
    expect(screen.getByTestId("voice-countdown")).toHaveTextContent("2");
    expect(screen.getByText("Get ready…")).toBeInTheDocument();
  });

  it("shows Start talking and the recording bar while recording, with the words so far", () => {
    voiceIn("recording", { partial: "I led", partialWords: [{ key: "a", text: "I" }, { key: "b", text: "led" }] });
    const { container } = renderMic();
    expect(screen.getByText("Start talking")).toBeInTheDocument();
    expect(container.querySelector(".voice-bar .voice-wave")).not.toBeNull();
    expect(screen.getByText(/Listening… 0:01 of 1:00/)).toBeInTheDocument();
    expect(container.querySelector(".answer-partial")).toHaveTextContent("I led");
  });

  it("says it is finishing the last words", () => {
    voiceIn("stopping");
    renderMic();
    expect(screen.getByText("Finishing the last words…")).toBeInTheDocument();
  });
});
