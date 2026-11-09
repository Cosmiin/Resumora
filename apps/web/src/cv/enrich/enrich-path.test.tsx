import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Each role's focus session is replaced by a stub: these tests are about the path around it.
vi.mock("./FocusMode.tsx", () => ({
  FocusMode: ({ target, next, onClose, topBar }: {
    target: { roleId: string }; next?: { label: string; onNext(): void }; onClose(): void; topBar?: React.ReactNode;
  }) => (
    <div data-testid="focus">
      {topBar}
      <p>Session for {target.roleId}</p>
      <button type="button" onClick={() => next?.onNext()}>{next?.label}</button>
      <button type="button" onClick={onClose}>✕ Close</button>
    </div>
  ),
}));
import { EnrichPath } from "./EnrichPath.tsx";

const role = (id: string, title: string): Experience => ({
  id, company: `${title} Co`, title, location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: `${id}-b`, text: "Did things." }], notes: [],
});
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "x", policy: "score/4", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});
const cv: CvContent = { ...emptyCv(), experience: [role("a", "Analyst"), role("b", "Buyer"), role("c", "Clerk"), role("d", "Driver")] };

function Host({ scores, onClose = () => {} }: { scores: Map<string, RoleScoreState>; onClose?(): void }) {
  return <EnrichPath cv={cv} dispatch={() => {}} scores={scores} waitForSave={() => Promise.resolve()} onClose={onClose} />;
}

describe("the guided path (1A)", () => {
  const scores = new Map<string, RoleScoreState>([["a", ready(90)], ["b", ready(61)], ["c", { state: "scoring" }], ["d", ready(80)]]);

  it("lists only roles below 80 (still scoring counts), in CV order, and starts with the first role's title", () => {
    render(<Host scores={scores} />);
    expect(screen.getByRole("heading", { name: "Let's make your CV stronger, one role at a time" })).toBeInTheDocument();
    expect(screen.getByText("About 3 minutes per role")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Buyer");
    expect(rows[0]).toContain("61");
    expect(rows[1]).toContain("Clerk");
    expect(screen.getByRole("button", { name: "Start with Buyer →" })).toBeInTheDocument();
  });

  it("goes role by role, then on to Key achievements", async () => {
    render(<Host scores={scores} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role →" }));
    expect(screen.getByText("Session for c")).toBeInTheDocument();
    expect(screen.getByText("Role 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.queryByTestId("focus")).toBeNull();
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("✕ closes the path; opening it again starts at the first role still below 80", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    await userEvent.click(screen.getByRole("button", { name: "✕ Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<Host scores={new Map(scores).set("b", ready(84))} />);
    expect(screen.getByRole("button", { name: "Start with Clerk →" })).toBeInTheDocument();
  });

  it("with no role below 80, Continue goes to Key achievements", async () => {
    render(<Host scores={new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]])} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("Not now closes the start screen", async () => {
    const onClose = vi.fn();
    render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps its stops when a visited role's score changes mid-path", async () => {
    function Live() {
      const [live, setLive] = useState(scores);
      return (
        <>
          <button type="button" onClick={() => setLive(new Map(live).set("b", ready(88)))}>rescore</button>
          <EnrichPath cv={cv} dispatch={() => {}} scores={live} waitForSave={() => Promise.resolve()} onClose={() => {}} />
        </>
      );
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    await userEvent.click(screen.getByRole("button", { name: "rescore" }));
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
  });
});
