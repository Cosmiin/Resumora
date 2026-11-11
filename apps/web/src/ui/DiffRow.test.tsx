import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DiffRow, type DiffDecision } from "./DiffRow.tsx";

const OLD = "Worked with Google Sheets and Airtable";
const NEW = "Design data tables in Airtable and Google Sheets that the workflows read and write";
const GUESS = { text: "Design data tables", reason: "Your line says “worked with Airtable”, so I inferred this." };

function Row({ inferred = false, guesses }: { inferred?: boolean; guesses?: { text: string; reason: string }[] }) {
  const [decision, setDecision] = useState<DiffDecision | null>(null);
  return (
    <>
      <DiffRow textLang="en" oldText={OLD} newText={NEW} reason="The ad asks for data models." inferred={inferred} guesses={guesses} decision={decision} onDecide={setDecision} />
      <pre data-testid="decision">{JSON.stringify(decision)}</pre>
    </>
  );
}

const decision = () => JSON.parse(screen.getByTestId("decision").textContent ?? "null") as DiffDecision | null;
const line = () => document.querySelector(".ui-diff-new")!;

describe("DiffRow", () => {
  it("shows the new line with its new words marked, the line on the CV now under it, and the reason", () => {
    render(<Row />);
    expect(line()).toHaveTextContent(NEW);
    expect(line()).toHaveAttribute("lang", "en");
    expect(line().querySelector("ins")).toHaveTextContent("Design data tables in Airtable and");
    expect(screen.getByText(OLD)).toHaveAttribute("lang", "en");
    expect(screen.getByText("Now:")).toBeInTheDocument();
    expect(screen.getByText("The ad asks for data models.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("Keep my line keeps the old bullet and says so", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Keep my line" }));
    expect(decision()).toEqual({ choice: "keep" });
    expect(screen.getByRole("status")).toHaveTextContent("Kept");
    expect(screen.getByRole("button", { name: "Keep my line" })).toHaveAttribute("aria-pressed", "true");
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
    await userEvent.click(screen.getByRole("button", { name: "Edit the line" }));
    const field = screen.getByRole("textbox", { name: "Edit the suggested bullet" });
    await userEvent.clear(field);
    await userEvent.type(field, "Maintain data tables in Airtable");
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: "Maintain data tables in Airtable" });
    expect(line()).toHaveTextContent("Maintain data tables in Airtable");
    expect(screen.getByRole("status")).toHaveTextContent("Using your edit");
  });

  it("an edit saved empty falls back to the suggestion", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Edit the line" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Edit the suggested bullet" }));
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
  });

  it("a guess underlines the guessed words, says in short what was written and why, and asks whether it is true", () => {
    render(<Row inferred guesses={[GUESS]} />);
    // The guessed words carry the mark on the line itself.
    expect(line().querySelector(".ui-diff-guess")).toHaveTextContent("Design data tables");
    const box = screen.getByText("One part of this line is my guess").parentElement!;
    expect(box).toHaveTextContent("I wrote Design data tables. Your line says “worked with Airtable”, so I inferred this.");
    expect(box).toHaveTextContent("Did you do this in this role?");
    expect(screen.getByRole("button", { name: "Yes, it's true. Use it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
  });

  it("a guess that names no phrase, or one that is not in the line, says only that it is not written anywhere", () => {
    render(<Row inferred guesses={[{ text: "Built dashboards", reason: "Not in the line." }]} />);
    const box = screen.getByText("One part of this line is my guess").parentElement!;
    expect(box).toHaveTextContent("It is not written in your CV or your answers.");
    expect(box).not.toHaveTextContent("Built dashboards");
    expect(line().querySelector(".ui-diff-guess")).toBeNull();
  });

  it("offers nothing when there is no real improvement", () => {
    render(<DiffRow textLang="en" oldText={OLD} newText={null} decision={null} onDecide={() => undefined} />);
    expect(screen.getByText("This bullet already fits the job. No change suggested.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
