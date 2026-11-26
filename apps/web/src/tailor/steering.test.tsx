import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./tailor-api.ts", () => ({ askAcross: vi.fn(async () => []), getToneExamples: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { useVoice } from "../cv/enrich/useVoice.ts";
import { ApiClientError } from "../lib/api.ts";
import { SteeringStep } from "./SteeringStep.tsx";
import { getToneExamples } from "./tailor-api.ts";

const examples = {
  formal: "Responsible for automated onboarding.", neutral: "Built onboarding automations.", confident: "Led onboarding automation.",
  concise: "Automated onboarding.", warm: "Helped teams leave manual onboarding behind.", technical: "Built Make scenarios for onboarding.",
  executive: "Drove automation that freed finance teams.",
};
const stored = { tone: "neutral" as const, draws: ["company" as const], fit: "mostly" as const, focusRoleIds: ["r2"], instruction: "Old note" };

function renderStep(onStart = vi.fn()) {
  render(<SteeringStep jobId="job1" busy={false} onStart={onStart} initial={stored} startLabel="Save changes" onCancel={vi.fn()} />);
  return onStart;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  vi.mocked(getToneExamples).mockResolvedValue({ bullet: "Built automations", examples });
});

describe("the Adjust screen", () => {
  it("shows the 7 tones with the person's own bullet in each and the free box, on one screen", async () => {
    renderStep();
    expect(screen.getByRole("heading", { name: "How should your CV sound?" })).toBeInTheDocument();
    expect(await screen.findByText(/Led onboarding automation./)).toBeInTheDocument();
    for (const name of ["Formal", "Neutral", "Confident", "Concise", "Warm", "Technical", "Executive"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^Neutral/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox")).toHaveValue("Old note");
    // The chip questions are no longer asked.
    expect(screen.queryByText("What draws you to this job?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(getToneExamples).toHaveBeenCalledWith("job1");
  });

  it("falls back to the fixed examples when the examples can't be made, never an error screen", async () => {
    vi.mocked(getToneExamples).mockRejectedValue(new ApiClientError(502, "ai_failed", "down"));
    renderStep();
    await waitFor(() => expect(getToneExamples).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^Confident/ })).toHaveTextContent(/\S+.*\S+/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tapping a tone only selects it; Save sends the tone and the note and keeps the earlier answers", async () => {
    const user = userEvent.setup();
    const onStart = renderStep();
    await user.click(screen.getByRole("button", { name: /^Technical/ }));
    expect(screen.getByRole("button", { name: /^Technical/ })).toHaveAttribute("aria-pressed", "true");
    expect(onStart).not.toHaveBeenCalled();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Lean on the process work");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onStart).toHaveBeenCalledWith({ tone: "technical", draws: ["company"], fit: "mostly", focusRoleIds: ["r2"], instruction: "Lean on the process work" });
  });
});
