import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateField } from "./DateField.tsx";

function setup(value = "2020-05") {
  const onCommit = vi.fn();
  const onPresent = vi.fn();
  render(<DateField value={value} locale="en" label="Start date" onCommit={onCommit} onPresent={onPresent} />);
  return { onCommit, onPresent, box: screen.getByRole("textbox", { name: "Start date" }) };
}

describe("DateField", () => {
  it("shows the date in the CV's language", () => {
    expect(setup().box).toHaveValue("May 2020");
  });

  it('a typed "03/2021" is saved as 2021-03', async () => {
    const { box, onCommit } = setup();
    await userEvent.clear(box);
    await userEvent.type(box, "03/2021");
    expect(onCommit).toHaveBeenLastCalledWith("2021-03");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it('"Spring" shows the hint and is not saved', async () => {
    const { box, onCommit } = setup();
    await userEvent.clear(box);
    onCommit.mockClear();
    await userEvent.type(box, "Spring");
    expect(screen.getByRole("status")).toHaveTextContent('Not saved yet. Try "Mar 2021", "03/2021" or "2021".');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("leaving an invalid date puts back the last good one", async () => {
    const { box } = setup();
    await userEvent.clear(box);
    await userEvent.type(box, "Spring");
    await userEvent.tab();
    expect(box).toHaveValue("May 2020");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it('"prezent" calls onPresent', async () => {
    const { box, onPresent } = setup();
    await userEvent.clear(box);
    await userEvent.type(box, "prezent");
    expect(onPresent).toHaveBeenCalled();
  });
});
