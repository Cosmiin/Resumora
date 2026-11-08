import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { JobScoreCard } from "./JobScoreCard.tsx";

const requirements: JobExtraction["requirements"] = [
  { text: "SQL", kind: "must", category: "skill" },
  { text: "Reporting", kind: "must", category: "experience" },
  { text: "German", kind: "must", category: "language" },
  { text: "French", kind: "nice", category: "language" },
];
const score: MatchScore = {
  policy: "match/1", total: 55, band: "fair", capped: true,
  parts: { requirements: { points: 0.5, max: 50 }, keywords: { points: 1, max: 30 }, seniority: null,
    langEdu: { points: 0, max: 20 } },
  labels: [
    { ref: "r0", kind: "requirement", status: "met", evidence: "Built SQL reports", inferred: false },
    { ref: "r1", kind: "requirement", status: "partial", evidence: null, inferred: false },
    { ref: "r2", kind: "requirement", status: "missing", evidence: null, inferred: false },
    { ref: "r3", kind: "requirement", status: "missing", evidence: null, inferred: false },
  ],
};

describe("job score", () => {
  it("keeps the score but hides requirement matches when an edit changes their count", () => {
    render(<JobScoreCard score={score} requirements={requirements.slice(1)} />);
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(screen.getByText("You edited this job after it was scored, so the requirement list is hidden.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/must-haves missing/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Met")).not.toBeInTheDocument();
  });
  it("shows the total, band, requirement matches and honest next steps only for missing musts", () => {
    render(<JobScoreCard score={score} requirements={requirements} />);
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(screen.getByText("1 must-haves missing")).toBeInTheDocument();
    expect(screen.getByLabelText("Met")).toHaveTextContent("✓");
    expect(screen.getByLabelText("Partly met")).toHaveTextContent("~");
    expect(screen.getAllByLabelText("Missing")).toHaveLength(2);
    const next = "If you have it, tailoring will ask about it. If not, mention related experience or treat it as a gap.";
    expect(screen.getAllByText(next)).toHaveLength(1);
    expect(within(screen.getByText("German").closest("li")!).getByText(next)).toBeInTheDocument();
    expect(screen.getByText("Built SQL reports")).toBeInTheDocument();
  });
  it("toggles the weighted component points and explains the cap", async () => {
    render(<JobScoreCard score={score} requirements={requirements} />);
    const toggle = screen.getByRole("button", { name: "How is this scored?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Requirements coverage")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const text of ["Requirements coverage", "25 / 50 points", "30 / 30 points", "0 / 20 points", "Not scored",
      "A missing must-have caps the total at 69."]) expect(screen.getByText(text)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText("Requirements coverage")).not.toBeInTheDocument();
  });
  it("explains when the ad has nothing to score", () => {
    render(<JobScoreCard score={{ ...score, total: null, band: null, capped: false, labels: [],
      parts: { requirements: null, keywords: null, seniority: null, langEdu: null } }} requirements={[]} />);
    expect(screen.getByText("This ad doesn't list enough to score")).toBeInTheDocument();
    expect(screen.queryByText(/must-haves missing/)).not.toBeInTheDocument();
  });
  it("shows inferred matches as partial until confirmed", () => {
    render(<JobScoreCard score={{ ...score, labels: [{ ...score.labels[0]!, inferred: true }] }} requirements={[requirements[0]!]} />);
    expect(screen.getByLabelText("Partly met")).toHaveTextContent("~");
    expect(screen.queryByLabelText("Met")).not.toBeInTheDocument();
  });
});
