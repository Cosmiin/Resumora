import { useReducer, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";
import { useFocusSection } from "./useFocusSection.ts";
import { useOpenedSections } from "./useOpenedSections.ts";
import { cvReducer } from "./cvReducer.ts";

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const [opened, onOpen] = useOpenedSections();
  const stage = useRef<HTMLDivElement>(null);
  useFocusSection(stage);
  return (
    <div ref={stage}>
      <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} />
      <output data-testid="json">{JSON.stringify(cv)}</output>
    </div>
  );
}
const state = () => JSON.parse(screen.getByTestId("json").textContent ?? "{}") as CvContent;
const sk = (name: string) => ({ id: name, name });

describe("sections stay while being edited", () => {
  it("clearing the whole summary keeps the field focused and on the page", async () => {
    const cv = emptyCv();
    render(<Harness initial={{ ...cv, basics: { ...cv.basics, summary: "Hi" } }} />);
    const box = screen.getByRole("textbox", { name: "Summary" });
    await userEvent.click(box);
    await userEvent.clear(box);
    expect(state().basics.summary).toBe("");
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveFocus();
  });

  it("Backspace on the last To sort chip keeps its text editable and Enter adds it back", async () => {
    render(<Harness initial={{ ...emptyCv(), unclearSkills: [sk("Excel")] }} />);
    const box = screen.getByRole("textbox", { name: "Add skill to sort" });
    await userEvent.click(box);
    await userEvent.keyboard("{Backspace}");
    expect(state().unclearSkills).toHaveLength(0);
    const again = screen.getByRole("textbox", { name: "Add skill to sort" });
    expect(again).toHaveValue("Excel");
    await userEvent.keyboard("{Enter}");
    expect(state().unclearSkills.map((s) => s.name)).toEqual(["Excel"]);
  });

  it("Backspace on the last interest keeps the section and its text", async () => {
    render(<Harness initial={{ ...emptyCv(), interests: [sk("Chess")] }} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Interests" }));
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByRole("textbox", { name: "Interests" })).toHaveValue("Chess");
  });

  it("leaving a chip box with typed text adds the chip", async () => {
    render(<Harness initial={{ ...emptyCv(), interests: [sk("Chess")] }} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Interests" }), "Go");
    await userEvent.tab();
    expect(state().interests.map((i) => i.name)).toEqual(["Chess", "Go"]);
  });
});

describe("Escape on a picked grip", () => {
  it("puts the order back and keeps focus on the grip", async () => {
    const role = (id: string, title: string) => ({
      id, company: "Acme", title, location: "", startDate: "2020-03", endDate: "2022-05", current: false, description: "", bullets: [], notes: [],
    });
    render(<Harness initial={{ ...emptyCv(), experience: [role("a", "Alpha"), role("b", "Beta")] }} />);
    screen.getByRole("button", { name: "Reorder Alpha" }).focus();
    await userEvent.keyboard(" {ArrowDown}");
    expect(state().experience.map((r) => r.title)).toEqual(["Beta", "Alpha"]);
    await userEvent.keyboard("{Escape}");
    expect(state().experience.map((r) => r.title)).toEqual(["Alpha", "Beta"]);
    expect(screen.getByRole("button", { name: "Reorder Alpha" })).toHaveFocus();
  });
});

describe("Escape on a picked grip that did not move", () => {
  it("keeps focus on the grip", async () => {
    const role = { id: "a", company: "Acme", title: "Alpha", location: "", startDate: "2020-03", endDate: "2022-05", current: false, description: "", bullets: [], notes: [] };
    render(<Harness initial={{ ...emptyCv(), experience: [role] }} />);
    const grip = screen.getByRole("button", { name: "Reorder Alpha" });
    grip.focus();
    await userEvent.keyboard(" ");
    expect(grip).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
    expect(grip).toHaveFocus();
    expect(grip).toHaveAttribute("aria-pressed", "false");
  });
});
