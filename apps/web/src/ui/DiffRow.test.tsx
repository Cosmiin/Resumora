import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DiffRow, type DiffDecision } from "./DiffRow.tsx";

const OLD = "Worked with Google Sheets and Airtable";
const NEW = "Design data tables in Airtable and Google Sheets that the workflows read and write";

function Row({ inferred = false }: { inferred?: boolean }) {
  const [decision, setDecision] = useState<DiffDecision | null>(null);
  return (
    <>
      <DiffRow textLang="en" oldText={OLD} newText={NEW} reason="The ad asks for data models." inferred={inferred} decision={decision} onDecide={setDecision} />
      <pre data-testid="decision">{JSON.stringify(decision)}</pre>
    </>
  );
}

const decision = () => JSON.parse(screen.getByTestId("decision").textContent ?? "null") as DiffDecision | null;

describe("DiffRow", () => {
  it("shows the old bullet, the suggestion and the reason", () => {
    render(<Row />);
    const [old, suggested] = [...document.querySelectorAll(".ui-diff-text")];
    expect(old).toHaveTextContent(OLD);
    expect(old).toHaveAttribute("lang", "en");
    expect(suggested).toHaveTextContent(NEW);
    expect(suggested).toHaveAttribute("lang", "en");
    // The words that go are struck through on the old side; the words that come are marked on the new side.
    expect([...old!.querySelectorAll("del")].map((part) => part.textContent)).toEqual(["Worked with", "Airtable"]);
    expect(suggested!.querySelector("ins")).toHaveTextContent("Design data tables in Airtable and");
    expect(screen.getByText("The ad asks for data models.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("Keep mine keeps the old bullet, stamps that side and says so", async () => {
    render(<Row />);
    expect(screen.queryByText("Chosen")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(decision()).toEqual({ choice: "keep" });
    expect(screen.getByRole("status")).toHaveTextContent("Kept");
    expect(screen.getByRole("button", { name: "Keep mine" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Chosen").closest(".ui-diff-side")).toHaveClass("ui-diff-old");
  });

  it("Use this takes the suggestion; pressing it again changes nothing", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
    expect(screen.getByRole("status")).toHaveTextContent("Using new");
    await userEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
  });

  it("Edit lets you change the suggestion and uses your version", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Edit the new line myself" }));
    const field = screen.getByRole("textbox", { name: "Edit the suggested bullet" });
    await userEvent.clear(field);
    await userEvent.type(field, "Maintain data tables in Airtable");
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: "Maintain data tables in Airtable" });
    expect(document.querySelector(".ui-diff-new .ui-diff-text")).toHaveTextContent("Maintain data tables in Airtable");
    expect(screen.getByRole("status")).toHaveTextContent("Using your edit");
  });

  it("an edit saved empty falls back to the suggestion", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Edit the new line myself" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Edit the suggested bullet" }));
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
  });

  it("a guess says so in a sentence and asks for a yes", () => {
    render(<Row inferred />);
    expect(screen.getByText("Please check this one")).toBeInTheDocument();
    expect(screen.getByText("Part of this line is my guess: it is not written in your CV or your answers. Use it only if it is true.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, it's true. Use it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
  });

  it("a guess that names its phrases says what was guessed and why", () => {
    render(<DiffRow textLang="en" oldText={OLD} newText={NEW} inferred decision={null} onDecide={() => undefined}
      guesses={[{ text: "Design data tables", reason: "The ad asks for data models; your line only says you worked with the tools." }]} />);
    const box = screen.getByText("Please check this one").parentElement!;
    expect(box).toHaveTextContent("My guess: Design data tables");
    expect(box).toHaveTextContent("The ad asks for data models; your line only says you worked with the tools.");
    expect(box).toHaveTextContent("Use the new line only if this is true.");
    expect(screen.queryByText(/Part of this line is my guess/)).toBeNull();
  });

  it("offers nothing when there is no real improvement", () => {
    render(<DiffRow textLang="en" oldText={OLD} newText={null} decision={null} onDecide={() => undefined} />);
    expect(screen.getByText("This bullet already fits the job. No change suggested.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
