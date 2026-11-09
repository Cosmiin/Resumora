import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

function renderDone(over: { final?: MatchScore } = {}) {
  const router = createMemoryRouter([
    { path: "/jobs/:id/tailor", element: <DoneScreen jobId="one" docId="cv1" base={base} final={over.final ?? final} job={job} /> },
    { path: "/jobs/:id/cv", element: <p>CV page</p> },
  ], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => { vi.resetAllMocks(); });

describe("DoneScreen (DoneA)", () => {
  it("counts the score from base to final; Now met lists missing or partial → met, not met → met", async () => {
    vi.mocked(getTailored).mockResolvedValue(doc({}));
    renderDone();
    expect(screen.getByRole("heading", { name: "Tailoring done 🎉" })).toBeInTheDocument();
    const met = screen.getByRole("list", { name: "Now met" });
    expect(met).toHaveTextContent("Payroll accuracy");
    expect(met).toHaveTextContent("German");
    expect(met).not.toHaveTextContent("Team lead");
    expect(screen.getByText("All 2 must-haves met")).toBeInTheDocument();
  });

  it("says how many must-haves are still open", async () => {
    vi.mocked(getTailored).mockResolvedValue(doc({}));
    renderDone({ final: score(70, [label("r0", "partial"), label("r1", "met"), label("r2", "met")]) });
    expect(screen.getByText("1 must-have still open")).toBeInTheDocument();
  });

  it("Still to check counts each unreviewed guess and Review them opens the guided review", async () => {
    const user = userEvent.setup();
    vi.mocked(getTailored).mockResolvedValue(doc({ summary: { "summary#0": guess("works abroad"), "summary#1": guess("coaches", true) },
      skills: { "new-skill:BPMN": guess("BPMN") } }));
    const router = renderDone();
    expect(await screen.findByText("Still to check: 2 AI guesses")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Review them (about 1 minute)" }));
    expect(router.state.location.pathname + router.state.location.search).toBe("/jobs/one/cv?cv=cv1&review=1");
  });

  it("with 0 guesses the card is hidden", async () => {
    vi.mocked(getTailored).mockResolvedValue(doc({ summary: { "summary#0": guess("works abroad", true) } }));
    renderDone();
    await screen.findByRole("link", { name: "View your tailored CV" });
    await Promise.resolve();
    expect(screen.queryByText(/Still to check/)).toBeNull();
  });

  it.each([
    ["View your tailored CV", "/jobs/one/cv?cv=cv1"],
    ["Export PDF or Word", "/jobs/one/cv?cv=cv1&export=1"],
    ["Write a cover letter", "/jobs/one/cv?cv=cv1&tab=letter"],
  ])("%s goes to %s", async (name, to) => {
    const user = userEvent.setup();
    vi.mocked(getTailored).mockResolvedValue(doc({}));
    const router = renderDone();
    await user.click(screen.getByRole("link", { name }));
    expect(router.state.location.pathname + router.state.location.search).toBe(to);
  });
});
