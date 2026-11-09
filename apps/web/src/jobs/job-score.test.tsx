import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { RequirementList } from "./RequirementList.tsx";

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
const next = "If you have it, tailoring will ask about it. If not, mention related experience or treat it as a gap.";
const lines = () => within(screen.getByRole("list", { name: /What they ask for/ })).getAllByRole("listitem");

describe("requirements list (7A)", () => {
  it("lists every requirement once, in ad order, with the match total and band in the heading", () => {
    render(<RequirementList requirements={requirements} score={score} />);
    expect(screen.getByRole("heading", { name: "What they ask for · 4 · your match 55 Fair" })).toBeInTheDocument();
    expect(lines().map((line) => line.textContent)).toEqual(["✓SQL", "~Reporting", "✗German", "✗FrenchNice"]);
    expect(screen.getAllByText("SQL")).toHaveLength(1);
  });

  it("marks met, partly met and missing, and tags only nice-to-haves", () => {
    render(<RequirementList requirements={requirements} score={score} />);
    expect(screen.getByRole("img", { name: "Met" })).toHaveTextContent("✓");
    expect(screen.getByRole("img", { name: "Partly met" })).toHaveTextContent("~");
    expect(screen.getAllByRole("img", { name: "Missing" })).toHaveLength(2);
    expect(screen.getAllByText("Nice")).toHaveLength(1);
    expect(within(lines()[3]!).getByText("Nice")).toBeInTheDocument();
    expect(screen.queryByText("Must have")).toBeNull();
  });

  it("shows a line's evidence under it when clicked, and the missing-next hint on a missing must-have", async () => {
    render(<RequirementList requirements={requirements} score={score} />);
    expect(screen.queryByText("Built SQL reports")).toBeNull();
    expect(screen.queryByText(next)).toBeNull();
    const sql = within(lines()[0]!).getByRole("button");
    expect(sql).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(sql);
    expect(sql).toHaveAttribute("aria-expanded", "true");
    expect(within(lines()[0]!).getByText("Built SQL reports")).toBeInTheDocument();
    await userEvent.click(within(lines()[2]!).getByRole("button"));
    expect(within(lines()[2]!).getByText(next)).toBeInTheDocument();
    expect(screen.getAllByText(next)).toHaveLength(1);
    await userEvent.click(sql);
    expect(screen.queryByText("Built SQL reports")).toBeNull();
  });

  it("shows the same list without marks while there is no score, with the state line", () => {
    render(<RequirementList requirements={requirements} score={null} state={<p>Loading…</p>} />);
    expect(screen.getByRole("heading", { name: "What they ask for · 4" })).toBeInTheDocument();
    expect(lines().map((line) => line.textContent)).toEqual(["SQL", "Reporting", "German", "FrenchNice"]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows no marks and the edited note when requirements changed after scoring", () => {
    render(<RequirementList requirements={requirements.slice(1)} score={score} />);
    expect(screen.getByRole("heading", { name: "What they ask for · 3 · your match 55 Fair" })).toBeInTheDocument();
    expect(screen.getByText("You edited this job after it was scored, so the match marks are hidden.")).toBeInTheDocument();
    expect(lines()).toHaveLength(3);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows inferred matches as partly met until confirmed", () => {
    render(<RequirementList requirements={[requirements[0]!]} score={{ ...score, labels: [{ ...score.labels[0]!, inferred: true }] }} />);
    expect(screen.getByRole("img", { name: "Partly met" })).toHaveTextContent("~");
    expect(screen.queryByRole("img", { name: "Met" })).toBeNull();
  });

  it("explains when the ad has nothing to score, without marks", () => {
    render(<RequirementList requirements={[]} score={{ ...score, total: null, band: null, capped: false, labels: [],
      parts: { requirements: null, keywords: null, seniority: null, langEdu: null } }} />);
    expect(screen.getByRole("heading", { name: "What they ask for · 0" })).toBeInTheDocument();
    expect(screen.getByText("This ad doesn't list enough to score")).toBeInTheDocument();
    expect(screen.getByText("None listed.")).toBeInTheDocument();
  });

  it("keeps How is this scored? under the list, toggling the points and the cap", async () => {
    render(<RequirementList requirements={requirements} score={score} />);
    const toggle = screen.getByRole("button", { name: "How is this scored?" });
    expect(toggle.compareDocumentPosition(screen.getByRole("list")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    for (const text of ["Requirements coverage", "25 / 50 points", "30 / 30 points", "0 / 20 points", "Not scored",
      "A missing must-have caps the total at 69."]) expect(screen.getByText(text)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText("Requirements coverage")).toBeNull();
  });
});
