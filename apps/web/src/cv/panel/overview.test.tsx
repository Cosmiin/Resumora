import { useReducer, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, newId, type CvContent, type Experience } from "@resumora/shared";
import { EditablePage } from "../edit/EditablePage.tsx";
import { cvReducer } from "../edit/cvReducer.ts";
import { useFocusAfterRender } from "../edit/useFocusAfterRender.ts";
import { useOpenedSections } from "../edit/useOpenedSections.ts";
import { HelperPanel } from "./HelperPanel.tsx";

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const page = useRef<HTMLDivElement>(null);
  const [opened, onOpen] = useOpenedSections();
  const focusLater = useFocusAfterRender(page);
  return (
    <>
      <div ref={page} tabIndex={-1}>
        <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} />
      </div>
      <HelperPanel cv={cv} dispatch={dispatch} focus={null} onBack={() => {}} onFocusField={focusLater} onFocusPage={() => page.current?.focus()} opened={opened} onOpen={onOpen} />
      <output data-testid="json">{JSON.stringify(cv)}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("json").textContent ?? "{}") as CvContent;

function role(id: string): Experience {
  return { id, company: "Acme", title: "Dev", location: "", startDate: "2020-03", endDate: "", current: true, description: "", bullets: [], notes: [] };
}
const filled = (): CvContent => ({
  ...emptyCv(),
  basics: { ...emptyCv().basics, fullName: "Ada Lovelace", email: "ada@example.com", summary: "Maker." },
  experience: [role("r1")],
});

describe("helper panel overview", () => {
  it("flags list what is missing and Add creates the section", async () => {
    render(<Harness initial={filled()} />);
    const flag = screen.getByRole("button", { name: "Add Education" }).closest(".flag") as HTMLElement;
    expect(within(flag).getByText("Missing")).toBeInTheDocument();
    expect(flag.textContent).toContain("Add your highest degree or school.");
    await userEvent.click(within(flag).getByRole("button", { name: "Add Education" }));
    expect(state().education).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Add Education" })).toBeNull();
  });

  it("Fill in focuses the email field", async () => {
    render(<Harness initial={{ ...filled(), basics: { ...filled().basics, email: "" } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Fill in Email" }));
    expect(document.activeElement).toBe(document.querySelector('[data-field="email"]'));
  });

  it("hiding a section strikes it through and removes its flag", async () => {
    render(<Harness initial={filled()} />);
    expect(screen.getByRole("button", { name: "Add Education" })).toBeInTheDocument();
    // Education is not on the CV yet, so hide Experience and check the list instead.
    await userEvent.click(screen.getByRole("button", { name: "Hide Experience" }));
    const eye = screen.getByRole("button", { name: "Show Experience" });
    expect(eye).toHaveAttribute("aria-pressed", "false");
    const row = eye.closest(".sec-row") as HTMLElement;
    expect(row.querySelector(".name")).toHaveClass("off");
    expect(within(row).getByText("Hidden")).toBeInTheDocument();
    // A hidden empty section is never flagged.
    await userEvent.click(screen.getByRole("button", { name: "Add Education" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide Education" }));
    expect(screen.queryByRole("button", { name: "Add Education" })).toBeNull();
    expect(screen.queryByText("Add your highest degree or school.")).toBeNull();
  });

  it("adding a custom section focuses its heading", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Section to add" }), "custom");
    await userEvent.click(screen.getByRole("button", { name: "Add section" }));
    expect(state().custom).toHaveLength(1);
    const id = state().custom[0]!.id;
    expect(document.activeElement).toBe(document.querySelector(`[data-field="custom-${id}-title"]`));
  });

  it("sections can be reordered from the panel with the keyboard", async () => {
    const cv = { ...filled(), custom: [{ id: newId(), title: "", details: "" }] };
    render(<Harness initial={cv} />);
    const order = () => [...document.querySelectorAll(".sec-row .name")].map((n) => n.textContent);
    expect(order()).toEqual(["Summary", "Experience", "Other"]);
    screen.getByRole("button", { name: "Reorder Summary" }).focus();
    await userEvent.keyboard(" {ArrowDown} ");
    expect(order()).toEqual(["Experience", "Summary", "Other"]);
    expect(state().layout.order.indexOf("experience")).toBeLessThan(state().layout.order.indexOf("summary"));
  });

  it("Add Summary in the panel opens the empty summary on the page, focused, and drops its flag", async () => {
    render(<Harness initial={{ ...filled(), basics: { ...filled().basics, summary: "" } }} />);
    expect(document.querySelector('[data-field="summary"]')).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add Summary" }));
    expect(document.activeElement).toBe(document.querySelector('[data-field="summary"]'));
    expect(screen.queryByRole("button", { name: "Add Summary" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reorder Summary" })).toBeInTheDocument();
    expect(state().basics.summary).toBe("");
  });
});
