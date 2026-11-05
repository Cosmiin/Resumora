import { useReducer, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";
import { EditablePage } from "../edit/EditablePage.tsx";
import { cvReducer } from "../edit/cvReducer.ts";
import { useFocusAfterRender } from "../edit/useFocusAfterRender.ts";
import { useFocusSection } from "../edit/useFocusSection.ts";
import { useOpenedSections } from "../edit/useOpenedSections.ts";
import { HelperPanel } from "./HelperPanel.tsx";

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const page = useRef<HTMLDivElement>(null);
  const [opened, onOpen] = useOpenedSections();
  const focusLater = useFocusAfterRender(page);
  const [focus, clear] = useFocusSection(page);
  return (
    <>
      <div ref={page} tabIndex={-1} data-testid="page">
        <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} />
      </div>
      <HelperPanel cv={cv} dispatch={dispatch} focus={focus} onBack={clear} onFocusField={focusLater} onFocusPage={() => page.current?.focus()} opened={opened} onOpen={onOpen} />
    </>
  );
}

function role(over: Partial<Experience> = {}): Experience {
  return { id: "r1", company: "Acme", title: "Dev", location: "", startDate: "2020-03", endDate: "", current: false, description: "", bullets: [], notes: [], ...over };
}
const filled = (r: Experience = role()): CvContent => ({
  ...emptyCv(),
  basics: { ...emptyCv().basics, fullName: "Ada Lovelace", email: "ada@example.com", summary: "Maker." },
  experience: [r],
});
const roleTitle = () => screen.getByRole("textbox", { name: "Role title" });

describe("section tools", () => {
  it("clicking into a role shows its tools", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.click(roleTitle());
    expect(screen.getByRole("button", { name: "← All sections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I work here now" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remove role" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^move/i })).toBeNull();
  });

  it("moving into another section switches the panel", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.click(roleTitle());
    await userEvent.click(document.querySelector('[data-field="summary"]') as HTMLElement);
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "I work here now" })).toBeNull();
    expect(screen.getByText("Lead with your field and years of experience.")).toBeInTheDocument();
  });

  it("Esc returns to the overview", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.click(roleTitle());
    expect(screen.queryByText("Click any text on the page to edit it.")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("Click any text on the page to edit it.")).toBeInTheDocument();
    expect(roleTitle()).not.toHaveFocus();
  });

  it("the work-here-now switch shows Present on the page", async () => {
    render(<Harness initial={filled(role({ endDate: "2022-05" }))} />);
    expect(screen.queryByText("Present")).toBeNull();
    await userEvent.click(roleTitle());
    await userEvent.click(screen.getByRole("checkbox", { name: "I work here now" }));
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I work here now" })).toBeChecked();
  });

  it("hiding the section you are in sends focus to the page and the panel to the overview", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.click(roleTitle());
    await userEvent.click(screen.getByRole("button", { name: "Hide Experience" }));
    expect(screen.getByText("Click any text on the page to edit it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Experience" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId("page"));
  });

  it("Remove role keeps the panel on the section", async () => {
    render(<Harness initial={filled()} />);
    await userEvent.click(roleTitle());
    await userEvent.click(screen.getByRole("button", { name: "Remove role" }));
    expect(screen.queryByRole("textbox", { name: "Role title" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← All sections" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove role" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("page"));
  });

  it("AI buttons are visible, marked Coming next and do nothing", async () => {
    render(<Harness initial={{ ...filled(), achievements: [{ id: "a1", text: "Won an award" }] }} />);
    await userEvent.click(screen.getByDisplayValue("Won an award"));
    const btn = screen.getByRole("button", { name: /Pull achievements from my roles/ });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("title", "Arrives in the next project");
    expect(btn).toHaveTextContent("Coming next");
    const before = document.body.innerHTML;
    await userEvent.click(btn);
    expect(document.body.innerHTML).toBe(before);
  });
});
