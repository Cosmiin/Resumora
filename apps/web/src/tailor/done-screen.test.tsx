import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { JobExtraction, MatchLabel, MatchScore, TailoredCv } from "@resumora/shared";

vi.mock("./tailored-api.ts", () => ({ getTailored: vi.fn() }));
import { getTailored } from "./tailored-api.ts";
import { DoneScreen } from "./DoneScreen.tsx";

const label = (ref: string, status: MatchLabel["status"]): MatchLabel => ({ ref, kind: "requirement", status, evidence: null, inferred: false });
const score = (total: number, labels: MatchLabel[]): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const job = { title: "Payroll Lead", company: "Beta", requirements: [
  { text: "Payroll accuracy", kind: "must", category: "skill" },
  { text: "Team lead", kind: "must", category: "experience" },
  { text: "German", kind: "nice", category: "language" },
] } as unknown as JobExtraction;
const base = score(62, [label("r0", "missing"), label("r1", "met"), label("r2", "partial")]);
const final = score(81, [label("r0", "met"), label("r1", "met"), label("r2", "met")]);
const doc = (review: TailoredCv["review"]) => ({ id: "cv1", review }) as TailoredCv;
const guess = (text: string, reviewed = false) => ({ kept: true, inferred: true, reviewed, text });

const keyword = (word: string, status: MatchLabel["status"]): MatchLabel => ({ ref: `k:${word}`, kind: "keyword", status, evidence: null, inferred: false });

function renderDone(over: { final?: MatchScore; base?: MatchScore; job?: JobExtraction | null; onAnswers?(): void } = {}) {
  const router = createMemoryRouter([
    { path: "/jobs/:id/tailor", element: <DoneScreen jobId="one" docId="cv1" base={over.base ?? base} final={over.final ?? final}
      job={over.job === undefined ? job : over.job} onAnswers={over.onAnswers} /> },
    { path: "/jobs/:id/cv", element: <p>CV page</p> },
    { path: "/jobs/:id/cv/template", element: <p>Template page</p> },
  ], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => { vi.resetAllMocks(); vi.mocked(getTailored).mockResolvedValue(doc({})); });

describe("the finish screen", () => {
  it("shows the match before and after and what moved it, says every must-have is covered, and offers the next steps", () => {
    renderDone();
    expect(screen.getByRole("heading", { name: "Your CV covers every must-have" })).toBeInTheDocument();
    const musts = within(screen.getByRole("list", { name: "Must-haves" })).getAllByRole("listitem");
    expect(musts.map((item) => item.textContent)).toEqual(["Payroll accuracy (covered)", "Team lead (covered)"]);
    const big = document.querySelector(".tailor-bigscore")!;
    expect(big.querySelector("s")).toHaveTextContent("62");
    expect(big.querySelector("b")).toHaveTextContent("81");
    expect(screen.getByText("19 points better than your base CV.")).toBeInTheDocument();
    expect(screen.getByText("Must-haves shown: 1 of 2 → 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a template" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as ready" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change my answer" })).toBeNull();
  });

  it("names a must-have the CV does not show and offers to change the answer", async () => {
    const user = userEvent.setup();
    const onAnswers = vi.fn();
    renderDone({ final: score(70, [label("r0", "partial"), label("r1", "met"), label("r2", "met")]), onAnswers });
    expect(screen.getByRole("heading", { name: "One must-have isn't covered yet" })).toBeInTheDocument();
    const open = within(screen.getByRole("list", { name: "Must-haves" })).getAllByRole("listitem")[0]!;
    expect(open).toHaveTextContent("Payroll accuracy");
    expect(within(open).getByText("Not covered")).toBeInTheDocument();
    await user.click(within(open).getByRole("button", { name: "Change my answer" }));
    expect(onAnswers).toHaveBeenCalled();
  });

  it("counts several open must-haves, and has no Change my answer without somewhere to go back to", () => {
    renderDone({ final: score(60, [label("r0", "missing"), label("r1", "partial")]) });
    expect(screen.getByRole("heading", { name: "2 must-haves aren't covered yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change my answer" })).toBeNull();
  });

  it("shows the keywords now on the CV, up from the base CV, and names the ones still missing", () => {
    renderDone({
      base: score(62, [keyword("SQL", "met"), keyword("dbt", "missing"), keyword("Excel", "missing")]),
      final: score(80, [label("r0", "met"), label("r1", "met"), keyword("SQL", "met"), keyword("dbt", "met"), keyword("Excel", "partial")]),
    });
    expect(screen.getByRole("progressbar", { name: "Keywords from the ad on your CV" })).toHaveAttribute("aria-valuetext", "2 of 3");
    expect(screen.getByText("Up from 1. Still missing: Excel.")).toBeInTheDocument();
  });

  it("lists where the points came from when it knows", () => {
    const router = createMemoryRouter([{ path: "/", element: <DoneScreen jobId="one" docId="cv1" base={base} final={final} job={job}
      gains={[{ name: "Payroll Lead", points: 12 }, { name: "Skills", points: 7 }]} /> }]);
    render(<RouterProvider router={router} />);
    const rows = [...document.querySelectorAll(".tailor-result-from li")].map((row) => row.textContent);
    expect(rows).toEqual(["Payroll Lead+12", "Skills+7"]);
  });

  it("a job with no must-haves just says tailoring is done", () => {
    renderDone({ job: null });
    expect(screen.getByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Must-haves" })).toBeNull();
  });

  it("Still to check counts each unreviewed guess and Review them opens the guided review", async () => {
    const user = userEvent.setup();
    vi.mocked(getTailored).mockResolvedValue(doc({ summary: { "summary#0": guess("works abroad"), "summary#1": guess("coaches", true) },
      skills: { "new-skill:BPMN": guess("BPMN") } }));
    const router = renderDone();
    expect(await screen.findByText(/Still to check: 2 AI guesses/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Review them (about 1 minute)" }));
    expect(router.state.location.pathname + router.state.location.search).toBe("/jobs/one/cv?cv=cv1&review=1");
  });

  it("with 0 guesses the note is hidden", async () => {
    vi.mocked(getTailored).mockResolvedValue(doc({ summary: { "summary#0": guess("works abroad", true) } }));
    renderDone();
    await waitFor(() => expect(getTailored).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText(/Still to check/)).toBeNull();
  });

  it.each([
    ["Choose a template", "/jobs/one/cv/template?cv=cv1"],
    ["Open the CV", "/jobs/one/cv?cv=cv1"],
    ["Write a cover letter", "/jobs/one/cv?cv=cv1&tab=letter"],
  ])("%s goes to %s", async (name, to) => {
    const user = userEvent.setup();
    const router = renderDone();
    await user.click(screen.getByRole("link", { name }));
    expect(router.state.location.pathname + router.state.location.search).toBe(to);
  });
});
