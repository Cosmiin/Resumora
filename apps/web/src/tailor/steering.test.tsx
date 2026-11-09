import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./tailor-api.ts", () => ({ getToneExamples: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { useVoice } from "../cv/enrich/useVoice.ts";
import { ApiClientError } from "../lib/api.ts";
import { SteeringStep } from "./SteeringStep.tsx";
import { getToneExamples } from "./tailor-api.ts";

const roles = [
  { id: "r1", title: "Automation Consultant", company: "WeMakeFuture" },
  { id: "r2", title: "Budget and Reporting", company: "Philip Morris" },
];
const examples = {
  formal: "Responsible for automated onboarding.", neutral: "Built onboarding automations.", confident: "Led onboarding automation.",
  concise: "Automated onboarding.", warm: "Helped teams leave manual onboarding behind.", technical: "Built Make scenarios for onboarding.",
  executive: "Drove automation that freed finance teams.",
};

function renderStep(onStart = vi.fn()) {
  render(<SteeringStep jobId="job1" roles={roles} busy={false} onStart={onStart} />);
  return onStart;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  vi.mocked(getToneExamples).mockResolvedValue({ bullet: "Built automations", examples });
});

describe("steering screens", () => {
  it("shows the 7 tones with the person's own bullet in each, Neutral picked to start", async () => {
    renderStep();
    expect(screen.getByRole("heading", { name: "How should your CV sound?" })).toBeInTheDocument();
    expect(await screen.findByText(/Led onboarding automation\./)).toBeInTheDocument();
    for (const name of ["Formal", "Neutral", "Confident", "Concise", "Warm", "Technical", "Executive"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^Neutral/ })).toHaveAttribute("aria-pressed", "true");
    expect(getToneExamples).toHaveBeenCalledWith("job1");
  });

  it("falls back to the fixed examples when the examples can't be made, never an error screen", async () => {
    vi.mocked(getToneExamples).mockRejectedValue(new ApiClientError(502, "ai_failed", "down"));
    renderStep();
    await waitFor(() => expect(getToneExamples).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^Confident/ })).toHaveTextContent(/\S+.*\S+/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("tapping a tone card or a chip only selects it and never starts a run", async () => {
    const user = userEvent.setup();
    const onStart = renderStep();
    await user.click(screen.getByRole("button", { name: /^Warm/ }));
    expect(screen.getByRole("button", { name: /^Warm/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Neutral/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "The work itself" }));
    await user.click(screen.getByRole("button", { name: "Mostly, with a few gaps" }));
    expect(screen.getByRole("button", { name: "The work itself" })).toHaveAttribute("aria-pressed", "true");
    expect(onStart).not.toHaveBeenCalled();
  });

  it("offers the CV's experience roles to lean on", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const group = screen.getByRole("group", { name: "Which experience should we lean on most?" });
    expect(group.querySelectorAll("button")).toHaveLength(2);
    expect(group).toHaveTextContent("Automation Consultant · WeMakeFuture");
    expect(group).toHaveTextContent("Budget and Reporting · Philip Morris");
  });

  it("Start tailoring sends every answer", async () => {
    const user = userEvent.setup();
    const onStart = renderStep();
    await user.click(screen.getByRole("button", { name: /^Technical/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "The work itself" }));
    await user.click(screen.getByRole("button", { name: "A step up" }));
    await user.click(screen.getByRole("button", { name: "Very well" }));
    await user.click(screen.getByRole("button", { name: "It's a stretch" }));
    await user.click(screen.getByRole("button", { name: "Budget and Reporting · Philip Morris" }));
    await user.type(screen.getByRole("textbox"), "Lean on the process work");
    await user.click(screen.getByRole("button", { name: "Start tailoring" }));
    expect(onStart).toHaveBeenCalledWith({
      tone: "technical", draws: ["work", "step_up"], fit: "stretch", focusRoleIds: ["r2"], instruction: "Lean on the process work",
    });
  });

  it("Back to Tone keeps the answers", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole("button", { name: /^Concise/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "The company" }));
    await user.type(screen.getByRole("textbox"), "Keep it short");
    await user.click(screen.getByRole("button", { name: "← Tone: Concise" }));
    expect(screen.getByRole("button", { name: /^Concise/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "The company" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox")).toHaveValue("Keep it short");
  });
});
