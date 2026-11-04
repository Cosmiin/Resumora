import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageField } from "./PageField.tsx";
import { focusField } from "./focus.ts";

function Harness({ multiline }: { multiline?: boolean }) {
  const [value, setValue] = useState("Hello");
  return (
    <PageField
      value={value}
      onChange={setValue}
      label="Summary"
      fieldKey="summary"
      multiline={multiline}
      placeholder="A few sentences"
    />
  );
}

describe("PageField", () => {
  it("shows the value and calls onChange as you type", async () => {
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Summary" });
    expect(field).toHaveValue("Hello");
    await userEvent.type(field, " you");
    expect(field).toHaveValue("Hello you");
  });

  it("has the accessible name from label", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Summary")).toHaveAttribute("data-field", "summary");
  });

  it("a multiline field is a textarea, a single-line one an input", () => {
    const { unmount } = render(<Harness multiline />);
    expect(screen.getByRole("textbox", { name: "Summary" }).tagName).toBe("TEXTAREA");
    unmount();
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Summary" }).tagName).toBe("INPUT");
  });

  it("a single-line field widens with its text when field-sizing is missing", async () => {
    // jsdom answers "true" to every CSS.supports question, so say no like an older browser
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Summary" });
    expect(field).toHaveAttribute("size", "6");
    await userEvent.type(field, "!!");
    expect(field).toHaveAttribute("size", "8");
    vi.restoreAllMocks();
  });

  it("focusField puts the caret where asked", () => {
    render(
      <div data-testid="root">
        <Harness multiline />
      </div>,
    );
    const field = screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
    focusField(screen.getByTestId("root"), "summary", 2);
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(2);
    focusField(screen.getByTestId("root"), "summary");
    expect(field.selectionStart).toBe(5);
  });
});
