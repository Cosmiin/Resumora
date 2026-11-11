import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { Keywords, MatchNumber, MustHaves, NiceToHave, mustCount } from "./JobMatch.tsx";
import { JobScoreHow } from "./JobScoreCard.tsx";

const requirements: JobExtraction["requirements"] = [
  { text: "SQL", kind: "must", category: "skill" },
  { text: "Reporting", kind: "must", category: "experience" },
  { text: "German", kind: "must", category: "language" },
  { text: "French", kind: "nice", category: "language" },
  { text: "Tableau", kind: "nice", category: "skill" },
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
    { ref: "r4", kind: "requirement", status: "met", evidence: "Tableau dashboards", inferred: false },
    { ref: "k:SQL", kind: "keyword", status: "met", evidence: "SQL", inferred: false },
    { ref: "k:dbt", kind: "keyword", status: "missing", evidence: null, inferred: false },
    { ref: "k:Excel", kind: "keyword", status: "partial", evidence: "spreadsheets", inferred: false },
  ],
};
const next = "If you have it, tailoring will ask about it. If not, mention related experience or treat it as a gap.";
const lines = () => within(screen.getByRole("list", { name: "Must-haves" })).getAllByRole("listitem");

const group = (name: string) => within(screen.getByRole("list", { name })).getAllByRole("listitem");

describe("must-haves", () => {
  it("lists only the must-haves, each once, sorted so the gaps come first", () => {
    render(<MustHaves requirements={requirements} score={score} />);
    expect(group("Not on your CV yet · 1").map((line) => line.textContent)).toEqual(["German"]);
    expect(group("Partly on your CV · 1").map((line) => line.textContent)).toEqual(["Reporting"]);
    expect(group("Already on your CV · 1").map((line) => line.textContent)).toEqual(["SQL"]);
    expect(group("Already on your CV · 1")[0]).toHaveClass("is-has");
    expect(screen.getAllByText("SQL")).toHaveLength(1);
    expect(screen.queryByText("French")).toBeNull();
    // The total sits in the strip on top of the page, not under the list.
    expect(screen.queryByText(/Your match/)).toBeNull();
  });

  it("marks partly met and missing with a named dot", () => {
    render(<MustHaves requirements={requirements} score={score} />);
    expect(within(group("Partly on your CV · 1")[0]!).getByRole("img", { name: "Partly met" })).toHaveClass("is-partial");
    expect(within(group("Not on your CV yet · 1")[0]!).getByRole("img", { name: "Missing" })).not.toHaveClass("is-partial");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("opens a tag to the CV's own words, and a missing must-have to what tailoring will do about it", async () => {
    render(<MustHaves requirements={requirements} score={score} />);
    expect(screen.queryByText("Built SQL reports")).toBeNull();
    expect(screen.queryByText(next)).toBeNull();
    const sql = screen.getByRole("button", { name: "SQL" });
    expect(sql).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(sql);
    expect(sql).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Built SQL reports")).toBeInTheDocument();
    // Partly met with nothing to quote: nothing to open.
    expect(within(group("Partly on your CV · 1")[0]!).queryByRole("button")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /German/ }));
    expect(within(group("Not on your CV yet · 1")[0]!).getByText(next)).toBeInTheDocument();
    expect(screen.getAllByText(next)).toHaveLength(1);
    await userEvent.click(sql);
    expect(screen.queryByText("Built SQL reports")).toBeNull();
  });

  it("puts what it is given at the end of the sheet", () => {
    render(<MustHaves requirements={requirements} score={score}><NiceToHave inside requirements={requirements} score={score} /></MustHaves>);
    const sheet = screen.getByRole("heading", { name: "Must-haves" }).closest("section")!;
    expect(within(sheet).getByRole("heading", { name: "Nice to have", level: 3 })).toBeInTheDocument();
    expect(within(sheet).getByText("French")).toBeInTheDocument();
  });

  it("shows the same list without marks while there is no score, with the state line", () => {
    render(<MustHaves requirements={requirements} score={null} state={<p>Checking…</p>} />);
    expect(lines().map((line) => line.textContent)).toEqual(["SQL", "Reporting", "German"]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByText(/Your match/)).toBeNull();
  });

  it("shows no marks and says why when the requirements changed after scoring", () => {
    render(<MustHaves requirements={requirements.slice(1)} score={score} />);
    expect(screen.getByText("You edited this job after it was scored, so the match marks are hidden.")).toBeInTheDocument();
    expect(lines()).toHaveLength(2);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows an inferred match as partly met until it is confirmed", () => {
    render(<MustHaves requirements={[requirements[0]!]} score={{ ...score, labels: [{ ...score.labels[0]!, inferred: true }] }} />);
    expect(screen.getByRole("img", { name: "Partly met" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Met" })).toBeNull();
  });

  it("says when the ad has nothing to score, without marks or a total", () => {
    render(<MustHaves requirements={[]} score={{ ...score, total: null, band: null, capped: false, labels: [],
      parts: { requirements: null, keywords: null, seniority: null, langEdu: null } }} />);
    expect(screen.getByText("This ad doesn't list enough to score")).toBeInTheDocument();
    expect(screen.getByText("None listed.")).toBeInTheDocument();
    expect(screen.queryByText(/Your match/)).toBeNull();
    expect(screen.queryByRole("button", { name: "How is this scored?" })).toBeNull();
  });

});

describe("the match on top", () => {
  it("shows the total as a number with its band, read aloud as one sentence", () => {
    render(<MatchNumber score={score} />);
    expect(screen.getByText("Your match: 55 of 100")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
  });

  it("shows nothing when the ad had nothing to score", () => {
    const { container } = render(<MatchNumber score={{ ...score, total: null, band: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("How is this scored? toggles the points and the cap", async () => {
    render(<JobScoreHow score={score} />);
    const toggle = screen.getByRole("button", { name: "How is this scored?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    for (const text of ["Requirements coverage", "25 / 50 points", "30 / 30 points", "0 / 20 points", "Not scored",
      "A missing must-have caps the total at 69."]) expect(screen.getByText(text)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText("Requirements coverage")).toBeNull();
  });
});

describe("keywords", () => {
  it("counts the keywords the CV has and lists every one, marked", () => {
    render(<Keywords score={score} />);
    const bar = screen.getByRole("progressbar", { name: "On your CV" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "1 of 3");
    const chips = screen.getAllByRole("listitem");
    // Partly there does not count as on the CV.
    expect(chips.map((chip) => chip.textContent)).toEqual(["SQL (on your CV)", "dbt (not on your CV yet)", "Excel (not on your CV yet)"]);
    expect(chips.map((chip) => chip.className)).toEqual(["is-has", "is-miss", "is-miss"]);
  });

  it.each([null, { ...score, labels: score.labels.filter((label) => label.kind === "requirement") }])("shows nothing without keywords", (value) => {
    const { container } = render(<Keywords score={value} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("nice to have", () => {
  it("lists the nice-to-haves, marked from the score", () => {
    render(<NiceToHave requirements={requirements} score={score} />);
    expect(screen.getByRole("heading", { name: "Nice to have" })).toBeInTheDocument();
    const chips = screen.getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual(["French (not on your CV yet)", "Tableau (on your CV)"]);
    expect(chips.map((chip) => chip.className)).toEqual(["is-miss", "is-has"]);
  });

  it("lists them plain without a usable score, and shows nothing when the ad has none", () => {
    const view = render(<NiceToHave requirements={requirements} score={null} />);
    expect(screen.getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["French", "Tableau"]);
    expect(screen.getAllByRole("listitem").every((chip) => chip.className === "")).toBe(true);
    view.unmount();
    const { container } = render(<NiceToHave requirements={requirements.slice(0, 3)} score={score} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("mustCount", () => {
  it("counts the must-haves the CV fully shows", () => {
    expect(mustCount(requirements, score)).toEqual({ met: 1, total: 3 });
  });

  it("is null without a score, without a total, or when the requirements changed after scoring", () => {
    expect(mustCount(requirements, null)).toBeNull();
    expect(mustCount(requirements, { ...score, total: null })).toBeNull();
    expect(mustCount(requirements.slice(1), score)).toBeNull();
  });
});
