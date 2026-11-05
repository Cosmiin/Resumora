import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CategoryKey, type CvContent, type RewriteEvent } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ streamRewrite: vi.fn(), getSkillSuggestions: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { SectionTools } from "../panel/SectionTools.tsx";

const base: CvContent = {
  ...emptyCv(),
  basics: { ...emptyCv().basics, summary: "I am a hard worker. I do many things." },
  experience: [
    {
      id: "r1",
      company: "Acme",
      title: "Operations Coordinator",
      location: "",
      startDate: "2020-03",
      endDate: "",
      current: false,
      description: "",
      bullets: [{ id: "b1", text: "Built churn reports in SQL" }],
      notes: [],
    },
  ],
  technicalSkills: [{ id: "t1", name: "Excel" }],
  unclearSkills: [
    { id: "u1", name: "Customer care" },
    { id: "u2", name: "Docker" },
  ],
};

/** The tools over a real reducer with an undo stack, so "one undo step" can be checked. */
function Harness({ focus, waitForSave, onAction, initial = base }: { focus: CategoryKey; waitForSave?: () => Promise<void>; onAction?: (a: CvAction) => void; initial?: CvContent }) {
  const [h, setH] = useState<{ past: CvContent[]; cv: CvContent }>({ past: [], cv: initial });
  const dispatch = (a: CvAction) => {
    onAction?.(a);
    setH((s) => {
      const next = cvReducer(s.cv, a);
      return next === s.cv ? s : { past: [...s.past, s.cv], cv: next };
    });
  };
  const undo = () => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), cv: s.past.at(-1)! } : s));
  return (
    <>
      <p data-testid="summary">{h.cv.basics.summary}</p>
      <p data-testid="technical">{h.cv.technicalSkills.map((s) => s.name).join("|")}</p>
      <p data-testid="professional">{h.cv.professionalSkills.map((s) => s.name).join("|")}</p>
      <p data-testid="unclear">{h.cv.unclearSkills.map((s) => s.name).join("|")}</p>
      <button type="button" onClick={() => dispatch({ type: "setSummary", value: "Edited meanwhile." })}>
        Edit summary
      </button>
      <button type="button" onClick={undo}>
        Undo
      </button>
      <SectionTools cv={h.cv} dispatch={dispatch} focus={{ key: focus }} onBack={() => {}} onFocusPage={() => {}} waitForSave={waitForSave} />
    </>
  );
}

function fakeStream() {
  const s = { emit: (_e: RewriteEvent) => {} };
  api.streamRewrite.mockImplementation((_path: string, _body: unknown, onEvent: (e: RewriteEvent) => void) => {
    s.emit = (e) => act(() => onEvent(e));
    return new AbortController();
  });
  return s;
}

beforeEach(() => vi.resetAllMocks());

describe("summary tools", () => {
  it("shows a tick for each check that holds and a plain fix for each that fails", () => {
    render(<Harness focus="summary" />);
    expect(screen.getByText("2 to 4 sentences").closest("li")).toHaveTextContent("✓");
    expect(screen.getByText(/No "I" or "my"/).closest("li")).toHaveTextContent("Start with your field or job");
    expect(screen.getByText(/Names your current job or field/).closest("li")).toHaveTextContent("Recruiters scan for your job title.");
    expect(screen.getByText(/Has a number a recruiter can check/).closest("li")).toHaveTextContent("Years, people, shipments…");
    expect(screen.getByText(/Short enough to read/).closest("li")).toHaveTextContent("✓");
  });

  it("waits for the save, then streams the summary rewrite with an empty body", async () => {
    const stream = fakeStream();
    let release = () => {};
    const waitForSave = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Harness focus="summary" waitForSave={waitForSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    expect(waitForSave).toHaveBeenCalled();
    expect(api.streamRewrite).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalledWith("/v1/enrich/rewrite-summary", {}, expect.any(Function)));
    expect(stream).toBeTruthy();
  });

  it("grows muted while streaming and gets its buttons only when ready", async () => {
    const stream = fakeStream();
    render(<Harness focus="summary" />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalled());
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "delta", data: { index: 0, text: "Operations coordinator " } });
    stream.emit({ event: "delta", data: { index: 0, text: "with 5 years" } });
    const p = screen.getByText("Operations coordinator with 5 years").closest(".prop") as HTMLElement;
    expect(p).toHaveClass("streaming");
    expect(within(p).getByText("I am a hard worker. I do many things.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull();
    stream.emit({ event: "ready", data: { index: 0, text: "Operations coordinator with 5 years in retail." } });
    expect(screen.getByRole("button", { name: "Use this" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep mine" })).toBeInTheDocument();
  });

  it("Use this makes one summary edit that one undo takes back", async () => {
    const stream = fakeStream();
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="summary" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalled());
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "ready", data: { index: 0, text: "Operations Coordinator with 5 years in retail." } });
    await userEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: "setSummary", value: "Operations Coordinator with 5 years in retail." });
    expect(screen.getByTestId("summary")).toHaveTextContent("Operations Coordinator with 5 years in retail.");
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("summary")).toHaveTextContent("I am a hard worker. I do many things.");
  });

  it("Keep mine closes the review and changes nothing", async () => {
    const stream = fakeStream();
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="summary" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalled());
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "ready", data: { index: 0, text: "Something new." } });
    await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rewrite my summary" })).toBeInTheDocument();
  });

  it("a proposal that was dropped ends in the 'without adding facts' message", async () => {
    const stream = fakeStream();
    render(<Harness focus="summary" />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalled());
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "dropped", data: { index: 0, reason: "number" } });
    stream.emit({ event: "done", data: {} });
    expect(screen.getByText("Left out: it added a number you didn't give us")).toBeInTheDocument();
    expect(screen.getByText("Couldn't improve this without adding facts. Try answering a question first.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
  });

  it("a stream error with nothing ready offers Try again, which waits for the save and asks again", async () => {
    const stream = fakeStream();
    const waitForSave = vi.fn(() => Promise.resolve());
    render(<Harness focus="summary" waitForSave={waitForSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalled());
    stream.emit({ event: "error", data: { code: "ai_unavailable", message: "x" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't draft suggestions right now.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalledTimes(2));
    expect(waitForSave).toHaveBeenCalledTimes(2);
  });

  it("a summary edited after the rewrite started cannot be overwritten", async () => {
    const stream = fakeStream();
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="summary" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalledTimes(1));
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "ready", data: { index: 0, text: "Operations Coordinator with 5 years." } });
    await userEvent.click(screen.getByRole("button", { name: "Edit summary" }));
    expect(screen.getByRole("button", { name: "Use this" })).toBeDisabled();
    expect(screen.getByText(/Your summary changed./)).toBeInTheDocument();
    onAction.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.streamRewrite).toHaveBeenCalledTimes(2));
    stream.emit({ event: "start", data: { index: 0, replaces: "summary" } });
    stream.emit({ event: "ready", data: { index: 0, text: "Fresh rewrite." } });
    expect(screen.getByRole("button", { name: "Use this" })).toBeEnabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("if the save fails, it goes back to idle with a short message", async () => {
    const waitForSave = vi.fn(() => Promise.reject(new Error("offline")));
    render(<Harness focus="summary" waitForSave={waitForSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Rewrite my summary" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your changes first.");
    expect(screen.getByRole("button", { name: "Rewrite my summary" })).toBeEnabled();
    expect(api.streamRewrite).not.toHaveBeenCalled();
  });
});

describe("skills tools", () => {
  const answer = {
    suggestions: [
      { name: "SQL", group: "technicalSkills", evidence: "Built churn reports in SQL" },
      { name: "Delivery schedules", group: "professionalSkills", evidence: "Prepared weekly delivery schedules" },
    ],
    sort: [
      { skillId: "u1", group: "professionalSkills" },
      { skillId: "u2", group: "technicalSkills" },
    ],
  };

  it("names the tools that are missing and how many skills are left to sort", () => {
    render(<Harness focus="skills" />);
    expect(screen.getByText("Every skill is in a group").closest("li")).toHaveTextContent("2 left to sort");
    expect(screen.getByText("Tools from your roles are listed").closest("li")).toHaveTextContent("Missing: SQL");
  });

  it("shows each suggestion with its evidence line; Add puts it in its group and then reads Added", async () => {
    api.getSkillSuggestions.mockResolvedValue(answer);
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="skills" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    expect(await screen.findByText(/Built churn reports in SQL/, { selector: ".ev" })).toBeInTheDocument();
    expect(screen.getByText("Prepared weekly delivery schedules", { exact: false, selector: ".ev" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add SQL" }));
    expect(onAction).toHaveBeenCalledWith({ type: "addSkill", group: "technicalSkills", name: "SQL" });
    expect(screen.getByTestId("technical")).toHaveTextContent("Excel|SQL");
    const added = screen.getByRole("button", { name: "Added" });
    expect(added).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Delivery schedules" })).toBeEnabled();
  });

  it("waits for the save before asking", async () => {
    api.getSkillSuggestions.mockResolvedValue(answer);
    let release = () => {};
    const waitForSave = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Harness focus="skills" waitForSave={waitForSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    expect(api.getSkillSuggestions).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(api.getSkillSuggestions).toHaveBeenCalledTimes(1));
  });

  it("Sort for me shows every proposal ticked; Apply moves them in one action and one undo step", async () => {
    api.getSkillSuggestions.mockResolvedValue(answer);
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="skills" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Sort for me" }));
    const care = await screen.findByRole("checkbox", { name: /Customer care/ });
    expect(care).toBeChecked();
    expect(care.closest("label")).toHaveTextContent("→ Professional");
    expect(screen.getByRole("checkbox", { name: /Docker/ }).closest("label")).toHaveTextContent("→ Technical");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "moveSkills",
      moves: [
        { skillId: "u1", group: "professionalSkills" },
        { skillId: "u2", group: "technicalSkills" },
      ],
    });
    expect(screen.getByTestId("professional")).toHaveTextContent("Customer care");
    expect(screen.getByTestId("technical")).toHaveTextContent("Excel|Docker");
    expect(screen.getByTestId("unclear")).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("unclear")).toHaveTextContent("Customer care|Docker");
    expect(screen.getByTestId("technical")).toHaveTextContent(/^Excel$/);
  });

  it("an unticked proposal is left out of Apply", async () => {
    api.getSkillSuggestions.mockResolvedValue(answer);
    const onAction = vi.fn<(a: CvAction) => void>();
    render(<Harness focus="skills" onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Sort for me" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Docker/ }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onAction).toHaveBeenCalledWith({ type: "moveSkills", moves: [{ skillId: "u1", group: "professionalSkills" }] });
    expect(screen.getByTestId("unclear")).toHaveTextContent(/^Docker$/);
  });

  it("a failed request says so and Try again asks again", async () => {
    api.getSkillSuggestions.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(answer);
    render(<Harness focus="skills" />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't read your roles right now.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Add SQL" })).toBeInTheDocument();
    expect(api.getSkillSuggestions).toHaveBeenCalledTimes(2);
  });

  it("each click asks again, for Suggest and for Sort", async () => {
    api.getSkillSuggestions.mockResolvedValue(answer);
    render(<Harness focus="skills" />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    await screen.findByRole("button", { name: "Add SQL" });
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    await waitFor(() => expect(api.getSkillSuggestions).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Sort for me" }));
    await waitFor(() => expect(api.getSkillSuggestions).toHaveBeenCalledTimes(3));
  });

  it("a name returned twice is shown once", async () => {
    api.getSkillSuggestions.mockResolvedValue({
      suggestions: [
        { name: "SQL", group: "technicalSkills", evidence: "a" },
        { name: "sql", group: "technicalSkills", evidence: "b" },
      ],
      sort: [],
    });
    render(<Harness focus="skills" />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    await screen.findByRole("button", { name: "Add SQL" });
    expect(screen.getAllByRole("button", { name: /^Add sql$/i })).toHaveLength(1);
  });
});

describe("Coming next", () => {
  it("is gone from Summary and Skills", () => {
    const { unmount } = render(<Harness focus="summary" />);
    expect(screen.queryByText("Coming next")).toBeNull();
    unmount();
    render(<Harness focus="skills" />);
    expect(screen.queryByText("Coming next")).toBeNull();
  });

  it("stays on Key achievements", () => {
    render(<Harness focus="achievements" />);
    expect(screen.getByRole("button", { name: /Pull achievements from my roles/ })).toHaveTextContent("Coming next");
  });
});
