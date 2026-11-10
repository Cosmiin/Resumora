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
    expect(screen.getByText(OLD)).toHaveAttribute("lang", "en");
    expect(screen.getByText(NEW)).toHaveAttribute("lang", "en");
    expect(screen.getByText("The ad asks for data models.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("Keep keeps the old bullet and says so", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(decision()).toEqual({ choice: "keep" });
    expect(screen.getByRole("status")).toHaveTextContent("Kept");
    expect(screen.getByRole("button", { name: "Keep" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Use new takes the suggestion; pressing it again undoes the choice", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Use new" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
    expect(screen.getByRole("status")).toHaveTextContent("Using new");
    await userEvent.click(screen.getByRole("button", { name: "Use new" }));
    expect(decision()).toBeNull();
  });

  it("Edit lets you change the suggestion and uses your version", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Edit the suggested bullet" });
    await userEvent.clear(field);
    await userEvent.type(field, "Maintain data tables in Airtable");
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: "Maintain data tables in Airtable" });
    expect(screen.getByText("Maintain data tables in Airtable")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Using your edit");
  });

  it("an edit saved empty falls back to the suggestion", async () => {
    render(<Row />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Edit the suggested bullet" }));
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(decision()).toEqual({ choice: "new", text: NEW });
  });

  it("marks a suggestion that contains an inferred fact", () => {
    render(<Row inferred />);
    expect(screen.getByText("Inferred, please confirm")).toBeInTheDocument();
  });

  it("offers nothing when there is no real improvement", () => {
    render(<DiffRow textLang="en" oldText={OLD} newText={null} decision={null} onDecide={() => undefined} />);
    expect(screen.getByText("This bullet already fits the job. No change suggested.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
