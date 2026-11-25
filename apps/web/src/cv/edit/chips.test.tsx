import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipInput } from "./ChipInput.tsx";

function Harness() {
  const [items, setItems] = useState([{ id: "1", name: "SQL" }]);
  return (
    <ChipInput
      fieldKey="skills"
      label="Add skill"
      items={items}
      onAdd={(name) => setItems((all) => [...all, { id: name, name }])}
      onRemove={(id) => setItems((all) => all.filter((i) => i.id !== id))}
      onRename={(id, name) => setItems((all) => all.map((i) => (i.id === id ? { ...i, name } : i)))}
    />
  );
}

describe("ChipInput", () => {
  it("Enter adds a chip", async () => {
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Add skill" });
    await userEvent.type(box, "Python{Enter}");
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("a comma adds a chip", async () => {
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Add skill" });
    await userEvent.type(box, "Figma,");
    expect(screen.getByText("Figma")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("Backspace in an empty box pulls the last chip back", async () => {
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Add skill" });
    await userEvent.type(box, "{Backspace}");
    expect(screen.queryByText("SQL")).not.toBeInTheDocument();
    expect(box).toHaveValue("SQL");
  });

  it("the x button removes a chip", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Remove SQL" }));
    expect(screen.queryByText("SQL")).not.toBeInTheDocument();
  });

  it("clicking a chip edits it in place: Enter saves, Esc cancels, empty removes", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit SQL" }));
    const box = screen.getByRole("textbox", { name: "Edit SQL" });
    expect(box).toHaveFocus();
    await userEvent.clear(box);
    await userEvent.type(box, "PostgreSQL{Enter}");
    expect(screen.getByRole("button", { name: "Edit PostgreSQL" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit PostgreSQL" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Edit PostgreSQL" }), "xx{Escape}");
    expect(screen.getByRole("button", { name: "Edit PostgreSQL" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit PostgreSQL" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Edit PostgreSQL" }));
    await userEvent.tab();
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument();
  });
});
