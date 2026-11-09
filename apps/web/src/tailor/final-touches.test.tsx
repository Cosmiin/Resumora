import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type Proposal, type TailorRun } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(),
  runSection: vi.fn(), acceptSection: vi.fn(), getScores: vi.fn(), getToneExamples: vi.fn(),
}));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { getJob } from "../jobs/jobs-api.ts";
import { acceptSection, askQuestions, getRun, getScores, runSection } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";
import { SectionReview } from "./SectionReview.tsx";
import { movedKeys } from "./LayoutReview.tsx";

const at = "2026-11-08T10:00:00Z";
const makeRun = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "running", currentSection: "achievements", questions: null, answers: null, proposals: null, errorCode: null,
  roleOrder: [], currentRoleId: null, createdAt: at, updatedAt: at, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const cv = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, titles: ["Payroll Specialist"] },
  awards: [{ id: "a1", name: "Best team", issuer: "", date: "", description: "Won for payroll" }],
  languages: [{ id: "l1", name: "German", level: "B2" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
  vi.mocked(getCv).mockResolvedValue({ content: cv, version: 1, updatedAt: at });
  vi.mocked(getJob).mockRejectedValue(new Error("offline"));
  vi.mocked(askQuestions).mockResolvedValue([]);
});

describe("final touches (FinalA)", () => {
  it("marks only the section that jumped, not every section it passed", () => {
    expect([...movedKeys(["a", "b", "c", "d", "e"], ["d", "a", "b", "c", "e"])]).toEqual(["d"]);
    expect(movedKeys(["a", "b"], ["a", "b"]).size).toBe(0);
  });

  it("a section with 0 proposals makes one accept call and the next screen shows the tick", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(runSection)
      .mockResolvedValueOnce({ proposals: [], questions: [] })
      .mockResolvedValueOnce({ proposals: [{ itemId: "l1", field: "level", text: "B2 (professional)", inferred: false, flags: [] }], questions: [] });
    vi.mocked(acceptSection).mockResolvedValue({ run: makeRun({ currentSection: "languages" }), score: score(70) });
    const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Achievements: nothing to change ✓")).toBeInTheDocument();
    expect(acceptSection).toHaveBeenCalledTimes(1);
    expect(acceptSection).toHaveBeenCalledWith("run1", "achievements", { decisions: [], inferred: [], flags: [] });
    expect(screen.getByRole("heading", { name: "Languages" })).toBeInTheDocument();
  });

  it("a failed auto-accept shows no tick, and Retry sends the same accept again", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(runSection).mockResolvedValueOnce({ proposals: [], questions: [] })
      .mockResolvedValueOnce({ proposals: [{ itemId: "l1", field: "level", text: "B2 (professional)", inferred: false, flags: [] }], questions: [] });
    vi.mocked(acceptSection).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ run: makeRun({ currentSection: "languages" }), score: score(70) });
    const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] });
    render(<RouterProvider router={router} />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Achievements: nothing to change ✓")).toBeNull();
    await user.click(retry);
    expect(await screen.findByRole("heading", { name: "Languages" })).toBeInTheDocument();
    expect(screen.getAllByText("Achievements: nothing to change ✓")).toHaveLength(1);
    expect(acceptSection).toHaveBeenCalledTimes(2);
    expect(vi.mocked(acceptSection).mock.calls[1]).toEqual(["run1", "achievements", { decisions: [], inferred: [], flags: [] }]);
  });

  it("Languages shows the change with the same highlights; Keep the original reverts it", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const level: Proposal = { itemId: "l1", field: "level", text: "B2 (professional)", inferred: false, flags: [] };
    render(<SectionReview section="languages" proposals={[level]} flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
    expect(screen.getByText("German")).toBeInTheDocument();
    expect(document.querySelector("mark.tailor-new")?.textContent).toBe("(professional)");
    await user.click(screen.getByRole("button", { name: "Keep the original" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "l1", keep: false }], inferred: [], flags: [] });
  });

  it("Order and headline: the old headline struck through, moved sections marked; Undo both sends keep: false for both", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const order = [cv.layout.order[1]!, cv.layout.order[0]!, ...cv.layout.order.slice(2)];
    const proposals: Proposal[] = [
      { itemId: "layout", field: "order", text: order.join(","), inferred: false, flags: [] },
      { itemId: "headline", field: "title", text: "Payroll Lead", inferred: false, flags: [] },
    ];
    render(<SectionReview section="layout" proposals={proposals} flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
    expect(screen.getByText("Payroll Specialist").tagName).toBe("DEL");
    expect(screen.getByText("Payroll Lead")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Section order" });
    // Two sections swapped: one of them moved.
    expect(within(list).getAllByText("moved")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Undo both" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "layout", keep: false }, { itemId: "headline", keep: false }], inferred: [], flags: [] });
  });
});
