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
});
