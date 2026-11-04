import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";
import { cvReducer } from "./cvReducer.ts";

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  return (
    <>
      <EditablePage cv={cv} dispatch={dispatch} />
      <output data-testid="json">{JSON.stringify(cv)}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("json").textContent ?? "{}") as CvContent;
const titles = () => state().experience.map((r) => r.title);

function role(id: string, title: string): Experience {
  return {
    id,
    company: "Acme",
    title,
    location: "",
    startDate: "2020-03",
    endDate: "2022-05",
    current: false,
    description: "",
    bullets: [],
  };
}
const initial = (): CvContent => ({
  ...emptyCv(),
  experience: [role("a", "Alpha"), role("b", "Beta"), role("c", "Gamma")],
});

describe("reordering by keyboard", () => {
  it("Space, ArrowDown, Space moves a role down one place", async () => {
    render(<Harness initial={initial()} />);
    const grip = screen.getByRole("button", { name: "Reorder Alpha" });
    grip.focus();
    await userEvent.keyboard(" ");
    expect(grip).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    expect(titles()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(screen.getByRole("button", { name: "Reorder Alpha" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Reorder Alpha" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Escape puts it back", async () => {
    render(<Harness initial={initial()} />);
    screen.getByRole("button", { name: "Reorder Alpha" }).focus();
    await userEvent.keyboard(" {ArrowDown}{ArrowDown}");
    expect(titles()).toEqual(["Beta", "Gamma", "Alpha"]);
    await userEvent.keyboard("{Escape}");
    expect(titles()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(screen.getByRole("button", { name: "Reorder Alpha" })).toHaveFocus();
  });

  it("the move is announced", async () => {
    render(<Harness initial={initial()} />);
    screen.getByRole("button", { name: "Reorder Alpha" }).focus();
    await userEvent.keyboard(" ");
    const live = document.querySelector('[aria-live="assertive"]')!;
    expect(live.textContent).toContain("Alpha");
    expect(live.textContent).toContain("1 of 3");
    await userEvent.keyboard("{ArrowDown}");
    expect(live.textContent).toContain("2 of 3");
  });

  it("the grip has a name and the hint", () => {
    render(<Harness initial={initial()} />);
    const grip = screen.getByRole("button", { name: "Reorder Alpha" });
    const hint = document.getElementById(grip.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel.");
  });

  it("each item is a named group", () => {
    render(<Harness initial={initial()} />);
    expect(screen.getByRole("group", { name: "Alpha" })).toBeInTheDocument();
  });
});
