import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";
import { Overview } from "../panel/Overview.tsx";
import { useOpenedSections } from "./useOpenedSections.ts";
import { cvReducer } from "./cvReducer.ts";
import { emptyItem } from "./lists.ts";

function Harness({ initial, tailored = true }: { initial: CvContent; tailored?: boolean }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const [opened, onOpen] = useOpenedSections();
  return (
    <>
      <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} tailored={tailored} />
      <Overview cv={cv} dispatch={dispatch} onFocusField={() => {}} opened={opened} onOpen={onOpen} tailored={tailored} />
      <output data-testid="json">{JSON.stringify(cv)}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId("json").textContent ?? "{}") as CvContent;
const section = (key: string) => document.querySelector(`[data-section="${key}"]`);
const allGood = "Nothing missing. Every key section is filled in.";

/** A tailored CV with every flagged section filled in. */
function full(): CvContent {
  const cv = emptyCv();
  cv.basics = { ...cv.basics, fullName: "Ana Pop", email: "ana@example.com", summary: "Analyst who ships." };
  cv.experience = [{ ...(emptyItem("experience", "r1") as CvContent["experience"][number]), title: "Analyst", company: "Acme",
    bullets: [{ id: "b1", text: "Mapped processes" }] }];
  cv.technicalSkills = [{ id: "s1", name: "BPMN" }];
  cv.education = [{ ...(emptyItem("education", "e1") as CvContent["education"][number]), school: "ASE" }];
  cv.languages = [{ id: "l1", name: "English", level: "C1" }];
  cv.achievements = [{ id: "a1", text: "Cut payroll time by half" }];
  return cv;
}

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Section options for ${name}` }));
  return screen.getByRole("menu");
}

describe("tailored CV section menu (9B)", () => {
  it("is not on the base CV page", () => {
    render(<Harness initial={full()} tailored={false} />);
    expect(screen.queryByRole("button", { name: /Section options/ })).toBeNull();
  });

  it("offers Hide, Rename and Delete on each section heading", async () => {
    render(<Harness initial={full()} />);
    const menu = await openMenu("Summary");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent))
      .toEqual(["Hide from this CV", "Rename", "Delete from this CV"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Section options for Key achievements" })).toBeInTheDocument();
  });

  it("Hide removes the section from the page and leaves it out of the export, and Show brings it back", async () => {
    render(<Harness initial={full()} />);
    await userEvent.click(within(await openMenu("Summary")).getByRole("menuitem", { name: "Hide from this CV" }));
    expect(section("summary")).toBeNull();
    // Exports leave out every section in layout.hidden (export/pdf.tsx, export/docx.ts).
    expect(state().layout.hidden).toEqual(["summary"]);
    expect(state().basics.summary).toBe("Analyst who ships.");
    expect(screen.getByText("1 section hidden")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Hidden sections" })).getByRole("button", { name: "Show Summary" }));
    expect(section("summary")).not.toBeNull();
    expect(state().layout.hidden).toEqual([]);
    expect(screen.queryByText(/sections? hidden/)).toBeNull();
  });

  it("Rename puts the cursor in the section heading", async () => {
    render(<Harness initial={full()} />);
    await userEvent.click(within(await openMenu("Summary")).getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Summary heading" })).toHaveFocus();
  });

  it("Delete empties and hides the section, and Undo restores its content and visibility", async () => {
    render(<Harness initial={full()} />);
    await userEvent.click(within(await openMenu("Key achievements")).getByRole("menuitem", { name: "Delete from this CV" }));
    expect(section("achievements")).toBeNull();
    expect(state().achievements).toEqual([]);
    expect(state().layout.hidden).toEqual(["achievements"]);
    const toast = screen.getByText("Key achievements deleted from this CV").closest("[role=status]") as HTMLElement;
    expect(toast).not.toBeNull();
    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(state().achievements).toEqual([{ id: "a1", text: "Cut payroll time by half" }]);
    expect(state().layout.hidden).toEqual([]);
    expect(section("achievements")).not.toBeNull();
    expect(screen.queryByText(/deleted from this CV/)).toBeNull();
  });

});

describe("tailored CV: empty sections and Needs attention", () => {
  it("does not render an empty Key achievements, lists it as hidden, and the panel may say Nothing missing", () => {
    const cv = full();
    cv.achievements = [{ id: "a1", text: "" }, { id: "a2", text: "" }];
    render(<Harness initial={cv} />);
    expect(section("achievements")).toBeNull();
    expect(document.querySelector('[data-missing="achievements"]')).toBeNull();
    expect(screen.getByText("1 section hidden (1 empty)")).toBeInTheDocument();
    expect(screen.getByText(allGood)).toBeInTheDocument();
  });

  it("Show renders an empty section with its add button, and Needs attention then flags it", async () => {
    const cv = full();
    cv.achievements = [{ id: "a1", text: "" }, { id: "a2", text: "" }];
    render(<Harness initial={cv} />);
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Hidden sections" })).getByRole("button", { name: "Show Key achievements" }));
    const shown = section("achievements") as HTMLElement;
    expect(within(shown).getByRole("button", { name: "+ Add item" })).toBeInTheDocument();
    expect(screen.queryByText(allGood)).toBeNull();
    expect(screen.getByRole("button", { name: "Add Key achievements" })).toBeInTheDocument();
    expect(screen.queryByText(/sections? hidden/)).toBeNull();
  });

  it("never says Nothing missing while a shown section is empty", async () => {
    render(<Harness initial={full()} />);
    expect(screen.getByText(allGood)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "Summary" }));
    expect(state().basics.summary).toBe("");
    expect(section("summary")).not.toBeNull();
    expect(screen.queryByText(allGood)).toBeNull();
    expect(screen.getByRole("button", { name: "Add Summary" })).toBeInTheDocument();
  });

});
