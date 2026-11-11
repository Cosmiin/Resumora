import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { ConfirmList, parseWarning } from "./ConfirmList.tsx";

const base: CvContent = {
  ...emptyCv(),
  basics: { ...emptyCv().basics, fullName: "Ana Maria Pop" },
  languages: [{ id: "l1", name: "English", level: "" }],
  certifications: [{ id: "c1", name: "SOFTR", issuer: "SOFTR", date: "2026" }],
};
const warnings = [
  "[name] The first and last name need confirming.",
  "[languages] English is listed without a level.",
  "[certifications] SOFTR is listed as both name and issuer.",
  "A date in the second role was unclear.",
];

function Host({ list = warnings }: { list?: string[] }) {
  const [cv, setCv] = useState(base);
  return (
    <>
      <ConfirmList warnings={list} cv={cv} onChange={(change) => setCv(change)} />
      <output>{JSON.stringify({ first: cv.basics.firstName, last: cv.basics.lastName, level: cv.languages[0]!.level, cert: cv.certifications[0] })}</output>
    </>
  );
}
const items = () => screen.getAllByRole("listitem");
const state = () => JSON.parse(document.querySelector("output")!.textContent!) as { first: string; last: string; level: string; cert: { name: string; issuer: string; date: string } };

describe("parseWarning", () => {
  it("reads the tag and removes it from the sentence; an unknown or missing tag is other", () => {
    expect(parseWarning("[name] Check the name.")).toEqual({ topic: "name", text: "Check the name." });
    expect(parseWarning("[dates] A date was unclear.")).toEqual({ topic: "other", text: "A date was unclear." });
    expect(parseWarning("No tag here.")).toEqual({ topic: "other", text: "No tag here." });
  });
});

describe("things to confirm", () => {
  it("shows nothing when there is nothing to confirm", () => {
    const { container } = render(<ConfirmList warnings={[]} cv={base} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each one without its tag, with its own actions and a count", () => {
    render(<Host />);
    expect(screen.getByRole("heading", { name: "4 things to confirm" })).toBeInTheDocument();
    expect(screen.getByText("0 of 4 confirmed")).toBeInTheDocument();
    expect(items().map((li) => li.querySelector("p")!.textContent)).toEqual([
      "The first and last name need confirming.", "English is listed without a level.",
      "SOFTR is listed as both name and issuer.", "A date in the second role was unclear.",
    ]);
    for (const li of items()) expect(within(li).getByRole("button", { name: "It's correct" })).toBeInTheDocument();
    expect(within(items()[0]!).getByRole("button", { name: "Change it" })).toBeInTheDocument();
    // Nothing to edit in place for a general note: it is confirmed, or noted to fix on the CV.
    expect(within(items()[3]!).queryByRole("button", { name: "Change it" })).toBeNull();
    expect(within(items()[3]!).getByRole("button", { name: "I'll fix it on my CV" })).toBeInTheDocument();
  });

  it("It's correct ticks the item off and keeps it visible", async () => {
    render(<Host />);
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "It's correct" }));
    expect(within(items()[1]!).getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 confirmed")).toBeInTheDocument();
    expect(items()).toHaveLength(4);
    await userEvent.click(within(items()[3]!).getByRole("button", { name: "I'll fix it on my CV" }));
    expect(within(items()[3]!).getByText("To fix on your CV")).toBeInTheDocument();
    expect(screen.getByText("2 of 4 confirmed")).toBeInTheDocument();
  });

  it("the name opens as first and last name, split as a starting point, and saves what the person wrote", async () => {
    render(<Host />);
    await userEvent.click(within(items()[0]!).getByRole("button", { name: "Change it" }));
    const first = screen.getByRole("textbox", { name: "First name" });
    const last = screen.getByRole("textbox", { name: "Last name" });
    expect(first).toHaveValue("Ana Maria");
    expect(last).toHaveValue("Pop");
    // Nothing is written until Save.
    expect(state()).toMatchObject({ first: "", last: "" });
    await userEvent.clear(first);
    await userEvent.type(first, "Ana");
    await userEvent.clear(last);
    await userEvent.type(last, "Maria Pop");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state()).toMatchObject({ first: "Ana", last: "Maria Pop" });
    expect(within(items()[0]!).getByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Cancel leaves the CV as it was", async () => {
    render(<Host />);
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "Change it" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Level for English" }), "C1");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state().level).toBe("");
    expect(screen.getByText("0 of 4 confirmed")).toBeInTheDocument();
  });

  it("a language gets its level, and a certification its name, issuer and date", async () => {
    render(<Host />);
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "Change it" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Level for English" }), "C1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state().level).toBe("C1");
    await userEvent.click(within(items()[2]!).getByRole("button", { name: "Change it" }));
    const issuer = screen.getByRole("textbox", { name: "Issued by" });
    await userEvent.clear(issuer);
    await userEvent.type(issuer, "Softr Academy");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state().cert).toEqual({ id: "c1", name: "SOFTR", issuer: "Softr Academy", date: "2026" });
  });

  it("does not save a date the CV cannot hold", async () => {
    render(<Host />);
    await userEvent.click(within(items()[2]!).getByRole("button", { name: "Change it" }));
    const date = screen.getByRole("textbox", { name: "Date" });
    await userEvent.clear(date);
    await userEvent.type(date, "May 2026");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("2024 or 2024-05");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-05");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state().cert.date).toBe("2026-05");
  });

  it("a confirmed item can be opened again", async () => {
    render(<Host />);
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "It's correct" }));
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "Change" }));
    expect(screen.getByRole("textbox", { name: "Level for English" })).toBeInTheDocument();
    expect(screen.getByText("0 of 4 confirmed")).toBeInTheDocument();
  });

  it("the same sentence twice is two items, confirmed one at a time", async () => {
    render(<Host list={["[other] Check the dates.", "[other] Check the dates."]} />);
    await userEvent.click(within(items()[0]!).getByRole("button", { name: "It's correct" }));
    expect(screen.getByText("1 of 2 confirmed")).toBeInTheDocument();
    expect(within(items()[1]!).getByRole("button", { name: "It's correct" })).toBeInTheDocument();
  });

  it("two forms open at once do not undo each other", async () => {
    render(<Host list={["[languages] English has no level.", "[languages] Check the level of English."]} />);
    await userEvent.click(within(items()[0]!).getByRole("button", { name: "Change it" }));
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "Change it" }));
    await userEvent.type(within(items()[0]!).getByRole("textbox", { name: "Level for English" }), "C1");
    await userEvent.click(within(items()[0]!).getByRole("button", { name: "Save" }));
    expect(state().level).toBe("C1");
    // The second form still shows what it opened with; saving it unchanged must not write that back.
    await userEvent.click(within(items()[1]!).getByRole("button", { name: "Save" }));
    expect(state().level).toBe("C1");
  });
});
