import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JobExtraction, MatchLabel, MatchScore, TailorQuestion } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({ askAcross: vi.fn(async () => []), getLanguages: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { useVoice } from "../cv/enrich/useVoice.ts";
import { keywordsOf } from "./KeywordsStep.tsx";
import { QuestionCard } from "./QuestionCard.tsx";

const label = (ref: string, status: MatchLabel["status"], kind: MatchLabel["kind"] = "keyword"): MatchLabel => ({ ref, kind, status, evidence: null, inferred: false });
const score = (labels: MatchLabel[]): MatchScore => ({ policy: "match/1", total: 60, band: "fair", capped: false, labels,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
});

describe("the keywords step", () => {
  it("counts only keywords the CV fully shows; requirements are not keywords", () => {
    expect(keywordsOf(score([label("k:SQL", "met"), label("k:dbt", "partial"), label("k:Excel", "missing"), label("r0", "met", "requirement")])))
      .toEqual({ has: ["SQL"], missing: ["dbt", "Excel"] });
    expect(keywordsOf(null)).toEqual({ has: [], missing: [] });
  });

});

describe("a question on the focus screen", () => {
  const job = { requirements: [{ text: "Webhooks and JSON", kind: "must", category: "skill" }] } as unknown as JobExtraction;
  const question: TailorQuestion = { id: "q1", section: "experience", roleId: "r1", text: "Did you use webhooks?", kind: "options",
    options: ["Yes", "No"], reason: "The ad lists webhooks as a must-have.", gap: "r0" };
  const card = (over: Partial<React.ComponentProps<typeof QuestionCard>> = {}) =>
    render(<QuestionCard question={question} progress="Question 2 of 2" index={1} total={2} onNext={vi.fn()} onSkip={vi.fn()} job={job}
      score={score([label("r0", "missing", "requirement")])} {...over} />);

  it("names what the ad asks for behind the question, how the CV stands on it, and why the coach asks", () => {
    card();
    expect(screen.getByText("The job ad asks for")).toBeInTheDocument();
    expect(screen.getByText("Webhooks and JSON")).toBeInTheDocument();
    expect(screen.getByText("Not in your CV yet")).toBeInTheDocument();
    expect(screen.getByText("Why I ask: The ad lists webhooks as a must-have.")).toBeInTheDocument();
    // The last question of the step says what happens next.
    expect(screen.getByRole("button", { name: "Finish the questions" })).toBeDisabled();
  });

  it("says partly for a requirement the CV half shows, and nothing about the ad for a question with no gap", () => {
    const view = card({ score: score([label("r0", "partial", "requirement")]) });
    expect(screen.getByText("Only partly in your CV")).toBeInTheDocument();
    view.unmount();
    card({ question: { ...question, gap: undefined } });
    expect(screen.queryByText("The job ad asks for")).toBeNull();
  });
});
