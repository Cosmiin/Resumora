import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JobExtraction, MatchLabel, MatchScore, TailorQuestion } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({ getLanguages: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { useVoice } from "../cv/enrich/useVoice.ts";
import { KeywordsStep, keywordsOf } from "./KeywordsStep.tsx";
import { LanguageStep } from "./LanguageStep.tsx";
import { QuestionCard } from "./QuestionCard.tsx";
import { getLanguages } from "./tailor-api.ts";

const label = (ref: string, status: MatchLabel["status"], kind: MatchLabel["kind"] = "keyword"): MatchLabel => ({ ref, kind, status, evidence: null, inferred: false });
const score = (labels: MatchLabel[]): MatchScore => ({ policy: "match/1", total: 60, band: "fair", capped: false, labels,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
});

describe("the language step", () => {
  it("says both are in one language and starts on the language tailoring would use", async () => {
    vi.mocked(getLanguages).mockResolvedValue({ cv: "ro", ad: "ro", chosen: "ro" });
    const onContinue = vi.fn();
    render(<LanguageStep jobId="one" onContinue={onContinue} />);
    expect(await screen.findByRole("heading", { name: "Your CV and this job ad are both in Romanian" })).toBeInTheDocument();
    expect(screen.queryByText("Employers usually expect the CV in the language of the ad.")).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith("ro");
  });

  it("says when the languages differ, and why that matters", async () => {
    vi.mocked(getLanguages).mockResolvedValue({ cv: "en", ad: "de", chosen: "de" });
    render(<LanguageStep jobId="one" onContinue={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Your CV is in English, this job ad is in German" })).toBeInTheDocument();
    expect(screen.getByText("Employers usually expect the CV in the language of the ad.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "German" })).toBeChecked();
  });

  it("says so when the ad's language is not clear", async () => {
    vi.mocked(getLanguages).mockResolvedValue({ cv: "en", ad: null, chosen: "en" });
    render(<LanguageStep jobId="one" onContinue={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Your CV is in English" })).toBeInTheDocument();
    expect(screen.getByText("Not clear")).toBeInTheDocument();
  });

  it("still lets the person choose when the check fails", async () => {
    vi.mocked(getLanguages).mockRejectedValue(new Error("offline"));
    const onContinue = vi.fn();
    render(<LanguageStep jobId="one" onContinue={onContinue} />);
    expect(await screen.findByText("We couldn't check the languages just now. You can still choose.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "French" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith("fr");
  });
});

describe("the keywords step", () => {
  it("counts only keywords the CV fully shows; requirements are not keywords", () => {
    expect(keywordsOf(score([label("k:SQL", "met"), label("k:dbt", "partial"), label("k:Excel", "missing"), label("r0", "met", "requirement")])))
      .toEqual({ has: ["SQL"], missing: ["dbt", "Excel"] });
    expect(keywordsOf(null)).toEqual({ has: [], missing: [] });
  });

  it("says when there is nothing to compare yet, lists the roles, and still starts", async () => {
    const onStart = vi.fn();
    const role = { id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true, description: "", bullets: [], notes: [] };
    render(<KeywordsStep score={null} roles={[role]} locale="en" busy={false} onBack={vi.fn()} onStart={onStart} onSteer={vi.fn()} />);
    expect(screen.getByText("We couldn't compare your CV with this ad's keywords yet.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("list", { name: "Your roles for this job" })).toHaveTextContent("Business AnalystEmedi · Mar 2021 – Present");
    await userEvent.click(screen.getByRole("button", { name: "Start with the first role" }));
    expect(onStart).toHaveBeenCalled();
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
